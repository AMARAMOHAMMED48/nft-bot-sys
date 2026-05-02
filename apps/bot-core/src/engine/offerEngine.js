const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { getGasGwei } = require('../data/gasPrice')
const { getWethBalance, getEthBalance, wrapEthToWeth } = require('../execution/wallet')
const { placeOffer, cancelOffer } = require('../execution/offerer')
const { notify } = require('../notify')

async function runOfferCycle(ctx) {
  const { wallet, user } = ctx
  const { id: userId, maxGasGwei, paperTrading } = user
  const offerExpiryMin = user.offerExpiryMin ?? 1440

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

  // Annuler les offres actives sur des collections désactivées
  const disabledCols = await prisma.userCollection.findMany({
    where: { userId, enabled: false },
    select: { collectionAddress: true, collectionName: true }
  })
  if (disabledCols.length) {
    const addrMap = new Map(disabledCols.map(c => [c.collectionAddress.toLowerCase(), c.collectionName]))
    const activeOffers = await prisma.offer.findMany({
      where: { userId, status: 'active', isPaperTrade: paperTrading }
    })
    for (const offer of activeOffers) {
      const key = offer.collection.toLowerCase()
      if (!addrMap.has(key)) continue
      try {
        await cancelOffer({ wallet, offerId: offer.id, isPaperTrade: paperTrading })
        await log(userId, 'info', 'offer', `Offre annulée — collection désactivée : ${addrMap.get(key) || offer.collection}`)
      } catch (err) {
        await log(userId, 'error', 'offer', `Échec annulation offre désactivée: ${err.message}`)
      }
    }
  }

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

  // Auto-wrap ETH → WETH : toujours convertir l'ETH disponible (au-dessus de la réserve)
  if (!paperTrading) {
    const reserve = user.ethReserveGas ?? 0.01
    const ethBalance = await getEthBalance(wallet)
    const toWrap = Math.floor((ethBalance - reserve) * 1e6) / 1e6
    if (toWrap >= 0.0001) {
      try {
        const { txHash, amountWrapped } = await wrapEthToWeth(wallet, toWrap)
        const wethAfter = await getWethBalance(wallet)
        await log(userId, 'info', 'offer', `Auto-wrap ${amountWrapped} ETH → WETH | Solde WETH: ${wethAfter.toFixed(4)} | tx: ${txHash.slice(0, 10)}...`)
      } catch (err) {
        const isNoFunds = err.code === 'INSUFFICIENT_FUNDS' || err.message?.includes('insufficient funds')
        await log(userId, isNoFunds ? 'info' : 'warn', 'offer', `Auto-wrap échoué: ${err.shortMessage || err.message}`)
      }
    }

    // Vérification WETH après wrap
    const weth = await getWethBalance(wallet)
    if (weth < 0.001) {
      await log(userId, 'warn', 'offer', `WETH insuffisant (${weth} ETH) — cycle ignoré`)
      return
    }
  }

  const collections = await prisma.userCollection.findMany({
    where: { userId, enabled: true }
  })

  for (const col of collections) {
    const floor = getFloor(col.collectionAddress)
    if (!floor) continue

    const belowFloorPct = col.offerBelowFloorPct
    const expiry        = offerExpiryMin

    // Prix = floor × (1 - pct/100), ex: floor=1, pct=5 → 0.95 ETH
    const price = parseFloat((floor * (1 - belowFloorPct / 100)).toFixed(4))
    if (price <= 0) {
      await log(userId, 'warn', 'offer', `Prix invalide (floor ${floor} × ${100 - belowFloorPct}% = ${price}) — offre ignorée pour ${col.collectionName}`)
      continue
    }

    // Vérifie l'offre active existante
    const existingOffer = await prisma.offer.findFirst({
      where: { userId, collection: col.collectionAddress, status: 'active' }
    })

    if (existingOffer) {
      // Prix identique → rien à faire (évite boucle infinie quand toFixed arrondit au-dessus du floor)
      if (existingOffer.offerPrice === price) continue

      const needsUpdate =
        existingOffer.offerPrice > floor * 1.02 ||    // offre > 2% au-dessus du floor → danger réel
        Math.abs(existingOffer.offerPrice - price) / floor > 0.01  // écart > 1% du floor → re-sync

      if (needsUpdate) {
        await cancelOffer({ wallet, offerId: existingOffer.id, isPaperTrade: paperTrading })
        await log(userId, 'info', 'offer', `Offre re-sync ${existingOffer.offerPrice} → ${price} ETH (floor: ${floor}) sur ${col.collectionName}`)
      } else {
        continue
      }
    }

    // Budget max non atteint
    if (totalEngaged + price > user.budgetMaxEth) {
      await log(userId, 'warn', 'offer', `Budget max atteint : ${totalEngaged.toFixed(4)}/${user.budgetMaxEth} ETH`)
      continue
    }

    // WETH check par offre (guard final)
    if (!paperTrading) {
      const weth = await getWethBalance(wallet)
      if (weth < price) {
        await log(userId, 'warn', 'offer', `WETH insuffisant pour ${col.collectionName} : ${weth.toFixed(4)} < ${price} ETH`)
        return
      }
    }

    const activeCount = await prisma.offer.count({
      where: { userId, collection: col.collectionAddress, status: 'active' }
    })
    if (activeCount >= col.offerMaxActive) {
      await log(userId, 'warn', 'offer', `Limite offres actives atteinte (${activeCount}/${col.offerMaxActive}) pour ${col.collectionName}`)
      continue
    }

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
