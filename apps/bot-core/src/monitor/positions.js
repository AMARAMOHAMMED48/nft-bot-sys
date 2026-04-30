const axios = require('axios')
const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { listToken } = require('../execution/lister')
const { notify } = require('../notify')

// walletAddress → Set of "collection:tokenId" déjà connus
const knownPositions = new Map()

async function fetchWalletNFTs(walletAddress, collections) {
  try {
    const contractAddresses = collections.map(c => `contractAddresses[]=${c}`).join('&')
    const res = await axios.get(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForOwner`,
      {
        params: {
          owner: walletAddress,
          withMetadata: false,
          pageSize: 100
        },
        // ajoute contractAddresses comme query string manuellement
        paramsSerializer: () => `owner=${walletAddress}&withMetadata=false&pageSize=100&${contractAddresses}`,
        timeout: 10000
      }
    )
    return res.data.ownedNfts || []
  } catch {
    return []
  }
}

async function checkNewPositions({ wallet, user }) {
  const collections = await prisma.userCollection.findMany({
    where: { userId: user.id, enabled: true },
    select: { collectionAddress: true }
  })
  if (!collections.length) return

  const addresses = collections.map(c => c.collectionAddress)
  const nfts = (await fetchWalletNFTs(user.walletAddress, addresses)).filter(n => n.contract?.address && n.tokenId)

  const walletKey = user.walletAddress
  if (!knownPositions.has(walletKey)) {
    // Premier check — initialise sans déclencher de listing
    const initial = new Set(nfts.map(n => `${n.contract.address}:${n.tokenId}`))
    knownPositions.set(walletKey, initial)
    return
  }

  const known = knownPositions.get(walletKey)

  for (const nft of nfts) {
    const key = `${nft.contract.address.toLowerCase()}:${nft.tokenId}`
    if (known.has(key)) continue

    // Nouveau NFT détecté !
    known.add(key)
    const collection = nft.contract.address.toLowerCase()
    const tokenId = nft.tokenId

    await handleNewNFT({ wallet, user, collection, tokenId })
  }

  // Nettoie les positions vendues
  const current = new Set(nfts.map(n => `${n.contract.address.toLowerCase()}:${n.tokenId}`))
  for (const key of known) {
    if (!current.has(key)) {
      known.delete(key)
      // NFT disparu → vendu → géré par le sale poller
    }
  }
}

async function handleNewNFT({ wallet, user, collection, tokenId }) {
  // Cherche une offre active correspondante
  const offer = await prisma.offer.findFirst({
    where: {
      userId: user.id,
      collection: { equals: collection, mode: 'insensitive' },
      status: 'active'
    },
    orderBy: { createdAt: 'desc' }
  })

  const buyPrice = offer?.offerPrice ?? 0

  // Vérifie si un trade existe déjà pour ce token
  const existing = await prisma.trade.findFirst({
    where: { userId: user.id, tokenId, collection, status: { in: ['bought', 'listed'] } }
  })
  if (existing) return

  // Marque l'offre comme acceptée
  if (offer) {
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: 'accepted', acceptedAt: new Date() }
    })
  }

  // Crée le trade
  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      tokenId,
      collection,
      source: 'offer_accepted',
      buyPrice,
      status: 'bought',
      isPaperTrade: user.paperTrading
    }
  })

  await prisma.botLog.create({
    data: {
      userId: user.id,
      level: 'info',
      module: 'positions',
      message: `NFT détecté dans wallet: ${collection} #${tokenId} — listing automatique`
    }
  })

  // Listing automatique au floor price
  const floor = getFloor(collection)
  if (!floor) {
    await prisma.botLog.create({
      data: { userId: user.id, level: 'warn', module: 'positions', message: `Floor introuvable pour ${collection} — listing différé` }
    })
    return
  }

  await listToken({
    wallet,
    tradeId: trade.id,
    collection,
    tokenId,
    listPrice: floor,
    isPaperTrade: user.paperTrading
  })

  const profit = floor - buyPrice
  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🎯 OFFRE ACCEPTÉE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${buyPrice} ETH → Listé: ${floor} ETH (floor)`,
    `Profit potentiel: +${profit.toFixed(4)} ETH (+${buyPrice > 0 ? ((profit / buyPrice) * 100).toFixed(1) : '∞'}%)`
  ].join('\n'))
}

function startPositionMonitor(ctx) {
  // Vérifie toutes les 30s
  setInterval(() => checkNewPositions(ctx), 30_000)
  checkNewPositions(ctx)
}

module.exports = { startPositionMonitor }
