const prisma = require('../lib/prisma')
const { notify } = require('../notify')

async function checkStopLoss(user) {
  const pnlData = await prisma.trade.aggregate({
    where: { userId: user.id, status: 'sold' },
    _sum: { pnl: true }
  })

  const totalPnl = pnlData._sum.pnl ?? 0

  if (totalPnl <= -user.stopLossEth) {
    await prisma.user.update({
      where: { id: user.id },
      data: { botEnabled: false }
    })

    await prisma.botLog.create({
      data: {
        userId: user.id,
        level: 'error',
        module: 'risk',
        message: `Stop-loss déclenché — P&L: ${totalPnl.toFixed(4)} ETH`
      }
    })

    await notify(user, [
      `🔴 STOP-LOSS | Bot arrêté automatiquement`,
      `Perte: ${totalPnl.toFixed(4)} ETH | Action requise sur le front.`
    ].join('\n'))

    return true
  }

  // Timeout sell — positions ouvertes depuis trop longtemps
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
    where: { userId: user.id, tokenId, collection, status: 'listed' }
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
