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

  await listToken({
    wallet,
    tradeId: trade.id,
    collection,
    tokenId,
    listPrice: floor,
    isPaperTrade: user.paperTrading,
    listExpiryMin: user.listExpiryMin ?? 10080
  })

  const profit = floor - offer.offerPrice
  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🎯 OFFRE ACCEPTÉE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${offer.offerPrice} ETH → Listé: ${floor} ETH (floor)`,
    `Profit potentiel: +${profit.toFixed(3)} ETH (+${((profit / offer.offerPrice) * 100).toFixed(1)}%)`
  ].join('\n'))

  await log(user.id, 'info', 'list', `Listé #${tokenId} à ${floor} ETH`)
}

async function listAfterSnipe({ wallet, user, tradeId, collection, tokenId, buyPrice }) {
  const floor = getFloor(collection)
  if (!floor) return

  await listToken({ wallet, tradeId, collection, tokenId, listPrice: floor, isPaperTrade: user.paperTrading })

  const label = user.paperTrading ? '[PAPER]' : ''
  await notify(user, [
    `🟢 SNIPE ${label} | ${collection} #${tokenId}`,
    `Acheté: ${buyPrice} ETH (${(((buyPrice / floor) - 1) * 100).toFixed(1)}% floor) → Listé: ${floor} ETH`
  ].join('\n'))
}

async function log(userId, level, module, message) {
  await prisma.botLog.create({ data: { userId, level, module, message } })
}

module.exports = { listAfterAccepted, listAfterSnipe }
