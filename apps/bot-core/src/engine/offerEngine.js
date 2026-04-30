const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { getGasGwei } = require('../data/gasPrice')
const { getWethBalance } = require('../execution/wallet')
const { placeOffer, cancelOffer } = require('../execution/offerer')
const { notify } = require('../notify')

async function runOfferCycle(ctx) {
  const { wallet, user } = ctx
  const { id: userId, offerMaxActive, maxGasGwei, paperTrading } = user
  const offerExpiryMin = user.offerExpiryMin ?? 1440

  if (!user.offerBelowFloor) {
    await log(userId, 'warn', 'offer', 'offerBelowFloor non configuré — bot inactif')
    return
  }

  // Annuler les offres expirées ou marquées cancelled par l'API
  const toCancel = await prisma.offer.findMany({
    where: {
      userId,
      status: { in: ['cancelled'] },
      isPaperTrade: paperTrading
    }
  })
  for (const offer of toCancel) {
    await cancelOffer({ wallet, offerId: offer.id, isPaperTrade: paperTrading })
  }

  // Expiration naturelle
  await prisma.offer.updateMany({
    where: {
      userId,
      status: 'active',
      expiresAt: { lt: new Date() }
    },
    data: { status: 'expired' }
  })

  const gas = getGasGwei()
  if (gas > maxGasGwei) {
    await log(userId, 'warn', 'offer', `Gas trop élevé : ${gas} gwei`)
    return
  }

  // Budget total engagé
  const budgetEngaged = await prisma.offer.aggregate({
    where: { userId, status: 'active' },
    _sum: { offerPrice: true }
  })
  const totalEngaged = budgetEngaged._sum.offerPrice ?? 0

  const collections = await prisma.userCollection.findMany({
    where: { userId, enabled: true }
  })

  for (const col of collections) {
    const floor = getFloor(col.collectionAddress)
    if (!floor) continue

    // Prix : floor - offerBelowFloor (dynamique) OU prix fixe OU config collection
    const belowFloor = col.offerBelowFloor ?? user.offerBelowFloor
    const expiry     = col.offerExpiryMin ?? offerExpiryMin

    const price = parseFloat((floor - belowFloor).toFixed(6))
    if (price <= 0) {
      await log(userId, 'warn', 'offer', `Prix négatif (floor ${floor} - ${belowFloor} = ${price}) — offre ignorée pour ${col.collectionName}`)
      continue
    }

    // Vérifie l'offre active existante
    const existingOffer = await prisma.offer.findFirst({
      where: { userId, collection: col.collectionAddress, status: 'active' }
    })

    if (existingOffer) {
      const needsUpdate =
        existingOffer.offerPrice >= floor ||           // offre au-dessus ou égal au floor → danger
        Math.abs(existingOffer.offerPrice - price) / floor > 0.01  // écart > 1% du floor → re-sync

      if (needsUpdate) {
        await cancelOffer({ wallet, offerId: existingOffer.id, isPaperTrade: paperTrading })
        await log(userId, 'info', 'offer', `Offre re-sync ${existingOffer.offerPrice} → ${price} ETH (floor: ${floor}) sur ${col.collectionName}`)
      } else {
        continue // Offre toujours valide, rien à faire
      }
    }

    // Budget max non atteint
    if (totalEngaged + price > user.budgetMaxEth) {
      await log(userId, 'warn', 'offer', `Budget max atteint : ${totalEngaged.toFixed(4)}/${user.budgetMaxEth} ETH`)
      continue
    }

    // WETH check en mode réel
    if (!paperTrading) {
      const weth = await getWethBalance(wallet)
      if (weth < price) {
        await log(userId, 'warn', 'offer', `WETH insuffisant : ${weth} < ${price}`)
        continue
      }
    }

    const activeCount = await prisma.offer.count({ where: { userId, status: 'active' } })

    try {
      await placeOffer({
        wallet, userId,
        collection: col.collectionAddress,
        offerPrice: price,
        floorPrice: floor,
        isPaperTrade: paperTrading,
        expiryMinutes: expiry
      })
    } catch (err) {
      await log(userId, 'error', 'offer', `Échec placement offre ${col.collectionName}: ${err.response?.data?.errors?.[0] || err.message}`)
      continue
    }

    await log(userId, 'info', 'offer', `Offre placée ${price} ETH sur ${col.collectionName}`)

    const label = paperTrading ? '[PAPER]' : ''
    await notify(user, [
      `✅ OFFRE ${label} | ${col.collectionName}`,
      `Prix: ${price} ETH | Floor: ${floor} ETH (${pct(price, floor)}%)`,
      `Budget engagé: ${(totalEngaged + price).toFixed(4)}/${user.budgetMaxEth} ETH | Expire: ${expiry}min`
    ].join('\n'))
  }
}

function pct(price, floor) {
  return (((price / floor) - 1) * 100).toFixed(1)
}

async function log(userId, level, module, message) {
  console.log(`[${level}][${module}] ${message}`)
  await prisma.botLog.create({ data: { userId, level, module, message } })
}

module.exports = { runOfferCycle }
