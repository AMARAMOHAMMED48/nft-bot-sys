const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
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

  // Timeout sell — positions listées depuis trop longtemps
  const timeout = new Date(Date.now() - user.timeoutSellH * 3600 * 1000)
  await prisma.trade.updateMany({
    where: {
      userId: user.id,
      status: 'listed',
      listedAt: { lt: timeout }
    },
    data: { status: 'timeout_sold' }
  })

  return false
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

module.exports = { checkStopLoss, onSale }
