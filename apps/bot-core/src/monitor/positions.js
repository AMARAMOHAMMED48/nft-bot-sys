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
        paramsSerializer: () => `owner=${walletAddress}&withMetadata=false&pageSize=100&${contractAddresses}`,
        timeout: 10000
      }
    )
    return res.data.ownedNfts || []
  } catch (err) {
    console.log(`[positions][error] Alchemy fetchWalletNFTs: ${err.response?.status} ${JSON.stringify(err.response?.data) || err.message}`)
    return []
  }
}

// Récupère tous les NFTs du wallet sans filtre (pour la recovery)
async function fetchAllWalletNFTs(walletAddress) {
  try {
    const res = await axios.get(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForOwner`,
      {
        params: { owner: walletAddress, withMetadata: false, pageSize: 100 },
        timeout: 10000
      }
    )
    const nfts = res.data.ownedNfts || []
    console.log(`[recovery][alchemy] totalCount=${res.data.totalCount} ownedNfts=${nfts.length} keys=${Object.keys(res.data).join(',')}`)
    if (nfts.length === 0 && res.data.totalCount > 0) {
      console.log(`[recovery][alchemy] totalCount>0 mais ownedNfts vide — réponse brute:`, JSON.stringify(res.data).slice(0, 500))
    }
    return nfts
  } catch (err) {
    console.log(`[recovery][error] Alchemy fetchAllWalletNFTs: ${err.response?.status} ${JSON.stringify(err.response?.data) || err.message}`)
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
  const allNfts = (await fetchAllWalletNFTs(user.walletAddress)).filter(n => n.contract?.address && n.tokenId)
  const nfts = allNfts.filter(n => addressSet.has(n.contract.address.toLowerCase()))

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

// Réconcilie wallet vs DB — crée les trades manquants si NFT présent sans trade
async function recoverMissingTrades({ wallet, user }) {
  const collections = await prisma.userCollection.findMany({
    where: { userId: user.id, enabled: true },
    select: { collectionAddress: true }
  })
  if (!collections.length) return

  const addresses = new Set(collections.map(c => c.collectionAddress.toLowerCase()))

  // Fetch sans filtre pour éviter les problèmes de format de query Alchemy
  const allNfts = (await fetchAllWalletNFTs(user.walletAddress)).filter(n => n.contract?.address && n.tokenId)
  const nfts = allNfts.filter(n => addresses.has(n.contract.address.toLowerCase()))

  console.log(`[recovery] Wallet scan — ${allNfts.length} NFT(s) total, ${nfts.length} dans les collections surveillées`)

  for (const nft of nfts) {
    const collection = nft.contract.address.toLowerCase()
    const tokenId = nft.tokenId

    const existing = await prisma.trade.findFirst({
      where: { userId: user.id, tokenId, collection, status: { in: ['bought', 'listed'] } }
    })
    if (existing) continue

    console.log(`[recovery][warn] NFT ${collection} #${tokenId} dans wallet sans trade — création`)

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
      console.log(`[recovery][info] Listing ${collection} #${tokenId} à ${floor} ETH`)
      await listToken({ wallet, tradeId: trade.id, collection, tokenId, listPrice: floor, isPaperTrade: user.paperTrading })
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
        data: { userId: user.id, level: 'warn', module: 'positions', message: `Recovery: floor introuvable pour ${trade.collection} #${trade.tokenId} — listing différé` }
      })
      continue
    }

    console.log(`[recovery][info] Re-listing ${trade.collection} #${trade.tokenId} à ${floor} ETH`)
    await prisma.botLog.create({
      data: { userId: user.id, level: 'info', module: 'positions', message: `Recovery: re-listing ${trade.collection} #${trade.tokenId} à ${floor} ETH` }
    })

    await listToken({
      wallet,
      tradeId: trade.id,
      collection: trade.collection,
      tokenId: trade.tokenId,
      listPrice: floor,
      isPaperTrade: user.paperTrading
    })
  }
}

function startPositionMonitor(ctx) {
  // 1. NFTs dans wallet sans trade en DB
  recoverMissingTrades(ctx).catch(() => {})
  // 2. Trades bought sans listing
  recoverUnlisted(ctx).catch(() => {})
  // Vérifie toutes les 30s
  setInterval(() => checkNewPositions(ctx), 30_000)
  checkNewPositions(ctx)
}

module.exports = { startPositionMonitor }
