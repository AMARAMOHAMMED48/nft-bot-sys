const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { listToken } = require('../execution/lister')
const { notify } = require('../notify')

async function checkStopLoss(user) {
  const globalStopLossPct = user.stopLossPct ?? 10

  const activeTrades = await prisma.trade.findMany({
    where: { userId: user.id, status: { in: ['bought', 'listed'] } }
  })

  for (const trade of activeTrades) {
    const floor = getFloor(trade.collection)
    if (!floor) continue

    // Config par collection → fallback global
    const colConfig = await prisma.userCollection.findFirst({
      where: { userId: user.id, collectionAddress: { equals: trade.collection, mode: 'insensitive' } },
      select: { stopLossPct: true }
    })
    const stopLossPct = colConfig?.stopLossPct ?? globalStopLossPct

    const stopPrice = parseFloat((trade.buyPrice * (1 - stopLossPct / 100)).toFixed(4))
    if (floor <= stopPrice) {
      await prisma.trade.update({
        where: { id: trade.id },
        data: { status: 'stop_loss' }
      })

      await prisma.botLog.create({
        data: {
          userId: user.id,
          level: 'warn',
          module: 'risk',
          message: `Stop-loss déclenché — ${trade.collection} #${trade.tokenId} | floor: ${floor} ≤ seuil: ${stopPrice} ETH (achat: ${trade.buyPrice} -${stopLossPct}%)`
        }
      })

      await notify(user, [
        `🔴 STOP-LOSS | ${trade.collection} #${trade.tokenId}`,
        `Floor: ${floor} ETH ≤ seuil: ${stopPrice} ETH | Achat: ${trade.buyPrice} ETH (-${stopLossPct}%)`
      ].join('\n'))
    }
  }

  return false
}

async function checkExpiredListings({ wallet, user }) {
  const globalRelistMin = user.relistAfterMin ?? 15
  const globalStopLossPct = user.stopLossPct ?? 10

  const listed = await prisma.trade.findMany({
    where: { userId: user.id, status: { in: ['listed', 'stop_loss'] }, isPaperTrade: user.paperTrading }
  })
  if (!listed.length) return

  for (const trade of listed) {
    if (!trade.listedAt) continue

    const colConfig = await prisma.userCollection.findFirst({
      where: { userId: user.id, collectionAddress: { equals: trade.collection, mode: 'insensitive' } },
      select: { relistAfterMin: true, stopLossPct: true }
    })
    const relistMin = colConfig?.relistAfterMin ?? globalRelistMin
    const stopLossPct = colConfig?.stopLossPct ?? globalStopLossPct

    const expired = (Date.now() - trade.listedAt.getTime()) >= relistMin * 60 * 1000
    if (!expired) continue

    const floor = getFloor(trade.collection)
    if (!floor) {
      await prisma.botLog.create({
        data: { userId: user.id, level: 'warn', module: 'risk',
          message: `Relist différé — floor introuvable pour ${trade.collection} #${trade.tokenId}` }
      })
      continue
    }

    const stopLossPrice = parseFloat((trade.buyPrice * (1 + stopLossPct / 100)).toFixed(4))
    const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))

    try {
      await listToken({
        wallet, user, tradeId: trade.id,
        collection: trade.collection, tokenId: trade.tokenId,
        listPrice, isPaperTrade: user.paperTrading,
        listExpiryMin: relistMin
      })
      const aboveFloor = listPrice > floor ? ` (plancher stop-loss au-dessus floor ${floor})` : ''
      await prisma.botLog.create({
        data: { userId: user.id, level: 'info', module: 'risk',
          message: `Auto-relist ${trade.collection} #${trade.tokenId} @ ${listPrice} ETH${aboveFloor}` }
      })
      await notify(user, [
        `🔄 AUTO-RELIST | ${trade.collection} #${trade.tokenId}`,
        `Prix: ${listPrice} ETH${aboveFloor} | Précédent listing > ${relistMin}min sans vente`
      ].join('\n'))
    } catch (err) {
      await prisma.botLog.create({
        data: { userId: user.id, level: 'error', module: 'risk',
          message: `Auto-relist échec ${trade.collection} #${trade.tokenId}: ${err.message}` }
      })
    }
  }
}

async function onSale({ user, saleData }) {
  const tokenId = saleData.token?.tokenId
  const collection = saleData.collection?.id
  const sellPrice = saleData.price?.amount?.native

  if (!tokenId || !sellPrice) return

  const trade = await prisma.trade.findFirst({
    where: { userId: user.id, tokenId, collection, status: { in: ['listed', 'stop_loss'] } }
  })
  if (!trade) return

  const pnl = sellPrice - trade.buyPrice - (trade.gasBuy ?? 0) - (trade.gasSell ?? 0)

  await prisma.trade.update({
    where: { id: trade.id },
    data: { sellPrice, status: 'sold', soldAt: new Date(), pnl }
  })

  const emoji = pnl >= 0 ? '✅' : '❌'
  await notify(user, [
    `💰 VENDU | ${collection} #${tokenId}`,
    `${trade.buyPrice} → ${sellPrice} ETH | P&L net: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} ETH ${emoji}`
  ].join('\n'))
}

module.exports = { checkStopLoss, checkExpiredListings, onSale }
