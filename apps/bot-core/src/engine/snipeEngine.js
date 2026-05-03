const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { getGasGwei } = require('../data/gasPrice')
const { fetchTokenRank } = require('../data/snipeRank')
const { buyToken } = require('../execution/snipeBuyer')
const { loadWallet } = require('../execution/wallet')
const { on } = require('../data/events')
const { listAfterSnipe } = require('./listEngine')
const { notify } = require('../notify')

const activeSnipeEngines = new Map()

async function checkSnipeConditions({ snipeConfig, userCollection, userId, priceEth, collectionAddress, tokenId }) {
  // 1. Prix : price <= floor * (1 + snipeFloorPct/100)
  if (userCollection.snipeFloorPct != null) {
    const floor = getFloor(collectionAddress)
    if (!floor) return false
    const threshold = floor * (1 + userCollection.snipeFloorPct / 100)
    if (priceEth > threshold) return false
  }

  // 2. Rank de rareté : rank <= snipeMaxRank
  if (userCollection.snipeMaxRank != null) {
    const rank = await fetchTokenRank(collectionAddress, tokenId)
    if (rank === null || rank > userCollection.snipeMaxRank) return false
  }

  // 3. Gas
  if (getGasGwei() > snipeConfig.maxGasGwei) return false

  // 4. Positions ouvertes
  const openPos = await prisma.trade.count({
    where: { userId, status: { in: ['bought', 'listed'] } }
  })
  if (openPos >= snipeConfig.maxPositions) return false

  // 5. Budget engagé
  const spent = await prisma.trade.aggregate({
    where: { userId, status: { in: ['bought', 'listed'] } },
    _sum: { buyPrice: true }
  })
  if ((spent._sum.buyPrice ?? 0) + priceEth > snipeConfig.budgetMaxEth) return false

  return true
}

async function handleListing({ wallet, user, snipeConfig, listing }) {
  const collectionAddress = listing.collection?.id?.toLowerCase()
  const tokenId = listing.token?.tokenId
  const priceEth = listing.price?.amount?.native

  if (!collectionAddress || !tokenId || !priceEth) return

  const userCollection = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress: { equals: collectionAddress, mode: 'insensitive' }, snipeEnabled: true }
  })
  if (!userCollection) return
  if (userCollection.snipeFloorPct == null && !userCollection.snipeMaxRank) return

  const ok = await checkSnipeConditions({
    snipeConfig, userCollection, userId: user.id, priceEth, collectionAddress, tokenId
  })
  if (!ok) return

  await prisma.botLog.create({
    data: { userId: user.id, level: 'info', module: 'snipe',
      message: `Snipe déclenché — ${userCollection.collectionName} #${tokenId} @ ${priceEth} ETH` }
  })

  try {
    const { tradeId } = await buyToken({
      wallet, userId: user.id, collection: collectionAddress, tokenId,
      buyPrice: priceEth, isPaperTrade: snipeConfig.paperTrading
    })

    const label = snipeConfig.paperTrading ? '[PAPER]' : ''
    await notify({ discordWebhook: snipeConfig.discordWebhook ?? user.discordWebhook }, [
      `🎯 SNIPE ${label} | ${userCollection.collectionName} #${tokenId}`,
      `Prix: ${priceEth} ETH | Floor: ${getFloor(collectionAddress) ?? '?'} ETH`
    ].join('\n'))

    await listAfterSnipe({
      wallet, user, tradeId, collection: collectionAddress, tokenId, buyPrice: priceEth
    })
  } catch { }
}

function startSnipeEngine(user) {
  if (activeSnipeEngines.has(user.id)) return

  prisma.snipeConfig.findUnique({ where: { userId: user.id } }).then(snipeConfig => {
    if (!snipeConfig || !snipeConfig.enabled || !snipeConfig.walletKeyEnc) return

    const { wallet } = loadWallet(snipeConfig.walletKeyEnc)

    const handler = (listing) => handleListing({ wallet, user, snipeConfig, listing })
    on('listing', handler)

    activeSnipeEngines.set(user.id, { handler })
    console.log(`[snipeEngine] Démarré pour ${user.email}`)
  })
}

function stopSnipeEngine(userId) {
  if (!activeSnipeEngines.has(userId)) return
  activeSnipeEngines.delete(userId)
  console.log(`[snipeEngine] Arrêté pour userId ${userId}`)
}

function isSnipeRunning(userId) {
  return activeSnipeEngines.has(userId)
}

module.exports = { startSnipeEngine, stopSnipeEngine, isSnipeRunning }
