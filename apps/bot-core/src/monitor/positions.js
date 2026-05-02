const axios = require('axios')
const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { listToken } = require('../execution/lister')
const { notify } = require('../notify')

// walletAddress → Set of "collection:tokenId" déjà connus
const knownPositions = new Map()

// Alchemy v3 avec withMetadata:false retourne { contractAddress, tokenId, balance }
async function fetchAllWalletNFTs(walletAddress) {
  try {
    const res = await axios.get(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForOwner`,
      {
        params: { owner: walletAddress, withMetadata: false, pageSize: 100 },
        timeout: 10000
      }
    )
    return (res.data.ownedNfts || []).filter(n => n.contractAddress && n.tokenId)
  } catch (err) {
    console.log(`[positions][error] Alchemy: ${err.response?.status} ${JSON.stringify(err.response?.data) || err.message}`)
    return []
  }
}

async function checkNewPositions({ wallet, user }) {
  const collections = await prisma.userCollection.findMany({
    where: { userId: user.id, enabled: true },
    select: { collectionAddress: true }
  })
  if (!collections.length) return

  const addressSet = new Set(collections.map(c => c.collectionAddress.toLowerCase()))
  const allNfts = await fetchAllWalletNFTs(user.walletAddress)
  const nfts = allNfts.filter(n => addressSet.has(n.contractAddress.toLowerCase()))

  const walletKey = user.walletAddress
  if (!knownPositions.has(walletKey)) {
    const initial = new Set(nfts.map(n => `${n.contractAddress.toLowerCase()}:${n.tokenId}`))
    knownPositions.set(walletKey, initial)
    return
  }

  const known = knownPositions.get(walletKey)

  for (const nft of nfts) {
    const key = `${nft.contractAddress.toLowerCase()}:${nft.tokenId}`
    if (known.has(key)) continue

    known.add(key)
    await handleNewNFT({ wallet, user, collection: nft.contractAddress.toLowerCase(), tokenId: nft.tokenId })
  }

  // Nettoie les positions vendues
  const current = new Set(nfts.map(n => `${n.contractAddress.toLowerCase()}:${n.tokenId}`))
  for (const key of known) {
    if (!current.has(key)) known.delete(key)
  }
}

async function handleNewNFT({ wallet, user, collection, tokenId }) {
  const offer = await prisma.offer.findFirst({
    where: { userId: user.id, collection: { equals: collection, mode: 'insensitive' }, status: 'active' },
    orderBy: { createdAt: 'desc' }
  })

  const buyPrice = offer?.offerPrice ?? 0

  const existing = await prisma.trade.findFirst({
    where: { userId: user.id, tokenId, collection, status: { in: ['bought', 'listed'] } }
  })
  if (existing) return

  if (offer) {
    await prisma.offer.update({ where: { id: offer.id }, data: { status: 'accepted', acceptedAt: new Date() } })
  }

  const trade = await prisma.trade.create({
    data: { userId: user.id, tokenId, collection, source: 'offer_accepted', buyPrice, status: 'bought', isPaperTrade: user.paperTrading }
  })

  await prisma.botLog.create({
    data: { userId: user.id, level: 'info', module: 'positions', message: `NFT détecté: ${collection} #${tokenId} — listing automatique` }
  })

  const floor = getFloor(collection)
  if (!floor) {
    await prisma.botLog.create({
      data: { userId: user.id, level: 'warn', module: 'positions', message: `Floor introuvable pour ${collection} — listing différé` }
    })
    return
  }

  const colConfig = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress: { equals: collection, mode: 'insensitive' } },
    select: { relistAfterMin: true }
  })
  const relistMin = colConfig?.relistAfterMin ?? user.relistAfterMin ?? 15

  const stopLossPrice = parseFloat((buyPrice * (1 + (user.stopLossPct ?? 1) / 100)).toFixed(4))
  const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))
  await listToken({ wallet, user, tradeId: trade.id, collection, tokenId, listPrice, isPaperTrade: user.paperTrading, listExpiryMin: relistMin })

  const profit = listPrice - buyPrice
  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🎯 OFFRE ACCEPTÉE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${buyPrice} ETH → Listé: ${listPrice} ETH`,
    `Profit potentiel: +${profit.toFixed(4)} ETH (+${buyPrice > 0 ? ((profit / buyPrice) * 100).toFixed(1) : '∞'}%)`
  ].join('\n'))
}

// Réconcilie wallet vs DB — crée les trades manquants si NFT présent sans trade
async function recoverMissingTrades({ wallet, user }) {
  const collections = await prisma.userCollection.findMany({
    where: { userId: user.id, enabled: true },
    select: { collectionAddress: true }
  })
  if (!collections.length) return

  const addresses = new Set(collections.map(c => c.collectionAddress.toLowerCase()))
  const allNfts = await fetchAllWalletNFTs(user.walletAddress)
  const nfts = allNfts.filter(n => addresses.has(n.contractAddress.toLowerCase()))

  console.log(`[recovery] Wallet scan — ${allNfts.length} NFT(s) total, ${nfts.length} dans les collections surveillées`)

  for (const nft of nfts) {
    const collection = nft.contractAddress.toLowerCase()
    const tokenId = nft.tokenId

    const existing = await prisma.trade.findFirst({
      where: { userId: user.id, tokenId, collection, status: { in: ['bought', 'listed'] } }
    })
    if (existing) {
      console.log(`[recovery] Trade existant pour ${collection} #${tokenId} — status: ${existing.status}`)
      continue
    }

    console.log(`[recovery][warn] NFT ${collection} #${tokenId} sans trade en DB — création`)

    const offer = await prisma.offer.findFirst({
      where: { userId: user.id, collection: { equals: collection, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }
    })
    const buyPrice = offer?.offerPrice ?? 0

    const trade = await prisma.trade.create({
      data: { userId: user.id, tokenId, collection, source: 'offer_accepted', buyPrice, status: 'bought', isPaperTrade: user.paperTrading }
    })

    if (offer && offer.status !== 'accepted') {
      await prisma.offer.update({ where: { id: offer.id }, data: { status: 'accepted', acceptedAt: new Date() } })
    }

    await prisma.botLog.create({
      data: { userId: user.id, level: 'warn', module: 'positions', message: `Recovery: trade créé pour ${collection} #${tokenId} (achat: ${buyPrice} ETH)` }
    })

    const floor = getFloor(collection)
    if (floor) {
      const colConfig = await prisma.userCollection.findFirst({
        where: { userId: user.id, collectionAddress: { equals: collection, mode: 'insensitive' } },
        select: { relistAfterMin: true }
      })
      const relistMin = colConfig?.relistAfterMin ?? user.relistAfterMin ?? 15

      const stopLossPrice = parseFloat((buyPrice * (1 + (user.stopLossPct ?? 1) / 100)).toFixed(4))
      const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))
      console.log(`[recovery][info] Listing ${collection} #${tokenId} à ${listPrice} ETH`)
      try {
        await listToken({ wallet, user, tradeId: trade.id, collection, tokenId, listPrice, isPaperTrade: user.paperTrading, listExpiryMin: relistMin })
      } catch (err) {
        const msg = err.response?.data?.errors?.[0] || err.message
        console.log(`[recovery][error] Échec listing ${collection} #${tokenId}: ${msg}`)
        await prisma.botLog.create({
          data: { userId: user.id, level: 'error', module: 'positions', message: `Recovery: échec listing ${tokenId}: ${msg}` }
        })
      }
    } else {
      console.log(`[recovery][warn] Floor introuvable pour ${collection} #${tokenId} — listing différé`)
    }
  }
}

// Reliste les trades bought non listés (crash/deploy entre achat et listing)
async function recoverUnlisted({ wallet, user }) {
  const pending = await prisma.trade.findMany({
    where: { userId: user.id, status: 'bought', listedAt: null, isPaperTrade: user.paperTrading }
  })
  if (!pending.length) {
    console.log('[recovery] Aucun trade orphelin trouvé')
    return
  }

  console.log(`[recovery] ${pending.length} trade(s) orphelin(s) détecté(s)`)

  for (const trade of pending) {
    const floor = getFloor(trade.collection)
    if (!floor) {
      console.log(`[recovery][warn] Floor introuvable pour ${trade.collection} #${trade.tokenId} — listing différé`)
      await prisma.botLog.create({
        data: { userId: user.id, level: 'warn', module: 'positions', message: `Recovery: floor introuvable pour ${trade.collection} #${trade.tokenId}` }
      })
      continue
    }

    const colConfig = await prisma.userCollection.findFirst({
      where: { userId: user.id, collectionAddress: { equals: trade.collection, mode: 'insensitive' } },
      select: { relistAfterMin: true }
    })
    const relistMin = colConfig?.relistAfterMin ?? user.relistAfterMin ?? 15

    const stopLossPrice = parseFloat((trade.buyPrice * (1 + (user.stopLossPct ?? 1) / 100)).toFixed(4))
    const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))
    console.log(`[recovery][info] Re-listing ${trade.collection} #${trade.tokenId} à ${listPrice} ETH`)
    await prisma.botLog.create({
      data: { userId: user.id, level: 'info', module: 'positions', message: `Recovery: re-listing ${trade.collection} #${trade.tokenId} à ${listPrice} ETH` }
    })

    await listToken({ wallet, user, tradeId: trade.id, collection: trade.collection, tokenId: trade.tokenId, listPrice, isPaperTrade: user.paperTrading, listExpiryMin: relistMin })
  }
}

async function runRecovery(ctx) {
  try { await recoverMissingTrades(ctx) } catch (err) { console.log(`[recovery][error] recoverMissingTrades: ${err.message}`) }
  try { await recoverUnlisted(ctx) } catch (err) { console.log(`[recovery][error] recoverUnlisted: ${err.message}`) }
}

function startPositionMonitor(ctx) {
  runRecovery(ctx)
  setInterval(() => checkNewPositions(ctx), 30_000)
  checkNewPositions(ctx)
}

module.exports = { startPositionMonitor }
