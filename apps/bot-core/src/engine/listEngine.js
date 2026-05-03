const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { listToken } = require('../execution/lister')
const { notify } = require('../notify')

async function listAfterAccepted({ wallet, user, offerId, tokenId, collection }) {
  const floor = getFloor(collection)
  if (!floor) {
    await log(user.id, 'warn', 'list', `Floor introuvable pour ${collection}`)
    return
  }

  const offer = await prisma.offer.findUnique({ where: { id: offerId } })
  if (!offer) return

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'accepted', acceptedAt: new Date() } })

  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      tokenId,
      collection,
      source: 'offer_accepted',
      buyPrice: offer.offerPrice,
      status: 'bought',
      isPaperTrade: user.paperTrading
    }
  })

  const relistMin = user.relistAfterMin ?? 15

  const colConfig = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress: { equals: collection, mode: 'insensitive' } },
    select: { stopLossPct: true }
  })
  const stopLossPct = colConfig?.stopLossPct ?? 1
  const stopLossPrice = parseFloat((offer.offerPrice * (1 + stopLossPct / 100)).toFixed(4))
  const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))

  await listToken({
    wallet,
    user,
    tradeId: trade.id,
    collection,
    tokenId,
    listPrice,
    isPaperTrade: user.paperTrading,
    listExpiryMin: relistMin
  })

  const profit = listPrice - offer.offerPrice
  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🎯 OFFRE ACCEPTÉE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${offer.offerPrice} ETH → Listé: ${listPrice} ETH`,
    `Profit potentiel: +${profit.toFixed(3)} ETH (+${((profit / offer.offerPrice) * 100).toFixed(1)}%)`
  ].join('\n'))

  await log(user.id, 'info', 'list', `Listé #${tokenId} à ${listPrice} ETH`)
}

async function listAfterSnipe({ wallet, user, tradeId, collection, tokenId, buyPrice }) {
  const floor = getFloor(collection)
  if (!floor) return

  const relistMin = user.relistAfterMin ?? 15

  const colConfig = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress: { equals: collection, mode: 'insensitive' } },
    select: { stopLossPct: true }
  })
  const stopLossPct = colConfig?.stopLossPct ?? 1
  const stopLossPrice = parseFloat((buyPrice * (1 + stopLossPct / 100)).toFixed(4))
  const listPrice = parseFloat(Math.max(floor, stopLossPrice).toFixed(4))

  await listToken({ wallet, user, tradeId, collection, tokenId, listPrice, isPaperTrade: user.paperTrading, listExpiryMin: relistMin })

  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🟢 SNIPE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${buyPrice} ETH (${(((buyPrice / floor) - 1) * 100).toFixed(1)}% floor) → Listé: ${listPrice} ETH`
  ].join('\n'))
}

async function log(userId, level, module, message) {
  await prisma.botLog.create({ data: { userId, level, module, message } })
}

module.exports = { listAfterAccepted, listAfterSnipe }
