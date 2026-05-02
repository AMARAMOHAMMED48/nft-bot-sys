const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { listToken } = require('../execution/lister')
const { getEthBalance, getWethBalance, wrapEthToWeth } = require('../execution/wallet')
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

async function onSale({ wallet, user, saleData }) {
  const tokenId = saleData.token?.tokenId
  const collection = saleData.collection?.id
  const sellPrice = saleData.price?.amount?.native

  if (!tokenId || !sellPrice) return

  const trade = await prisma.trade.findFirst({
    where: {
      userId: user.id,
      tokenId,
      collection: { equals: collection, mode: 'insensitive' },
      status: { in: ['listed', 'stop_loss'] }
    }
  })
  if (!trade) return

  const pnl = sellPrice - trade.buyPrice - (trade.gasBuy ?? 0) - (trade.gasSell ?? 0)

  await prisma.trade.update({
    where: { id: trade.id },
    data: { sellPrice, status: 'sold', soldAt: new Date(), pnl }
  })

  const col = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress: { equals: collection, mode: 'insensitive' } },
    select: { collectionName: true }
  })
  const collectionLabel = col?.collectionName || collection

  const emoji = pnl >= 0 ? '✅' : '❌'
  await notify(user, [
    `💰 VENDU | ${collectionLabel} #${tokenId}`,
    `${trade.buyPrice} → ${sellPrice} ETH | P&L net: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} ETH ${emoji}`
  ].join('\n'))

  if (user.autoWrapAfterSale && wallet && !user.paperTrading) {
    try {
      const reserve = user.ethReserveGas ?? 0.01
      const ethBalance = await getEthBalance(wallet)
      const toWrap = parseFloat(Math.min(sellPrice, ethBalance - reserve).toFixed(6))
      if (toWrap <= 0) {
        await prisma.botLog.create({
          data: { userId: user.id, level: 'warn', module: 'wrap',
            message: `Auto-wrap skip — ETH ${ethBalance.toFixed(4)} ≤ réserve ${reserve}` }
        })
        return
      }
      const { txHash } = await wrapEthToWeth(wallet, toWrap)
      const wethAfter = await getWethBalance(wallet)
      await prisma.botLog.create({
        data: { userId: user.id, level: 'info', module: 'wrap',
          message: `Auto-wrap ${toWrap} ETH → WETH | tx: ${txHash}` }
      })
      await notify(user, [
        `🔁 ETH → WETH | ${toWrap} ETH wrapped`,
        `Solde WETH: ${wethAfter.toFixed(4)} ETH | tx: ${txHash.slice(0, 10)}...`
      ].join('\n'))
    } catch (err) {
      await prisma.botLog.create({
        data: { userId: user.id, level: 'error', module: 'wrap',
          message: `Auto-wrap échec: ${err.message}` }
      })
    }
  }
}

module.exports = { checkStopLoss, checkExpiredListings, onSale }
