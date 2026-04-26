const prisma = require('../lib/prisma')
const { getFloor } = require('../data/floorPrice')
const { getGasGwei } = require('../data/gasPrice')
const { buyToken } = require('../execution/buyer')
const { listAfterSnipe } = require('./listEngine')

// Appelé par le WebSocket Reservoir sur chaque nouveau listing
async function onNewListing({ wallet, user, listing }) {
  const { token, collection, price } = listing
  const collectionAddress = collection?.id
  const tokenId = token?.tokenId
  const priceEth = price?.amount?.native

  if (!collectionAddress || !tokenId || !priceEth) return

  const userCollection = await prisma.userCollection.findFirst({
    where: { userId: user.id, collectionAddress, enabled: true }
  })
  if (!userCollection) return

  const floor = getFloor(collectionAddress)
  if (!floor) return

  const trigger = floor * user.buyTriggerPct
  if (priceEth > trigger) return

  const gas = getGasGwei()
  if (gas > user.maxGasGwei) return

  const openPositions = await prisma.trade.count({
    where: { userId: user.id, status: { in: ['bought', 'listed'] } }
  })
  if (openPositions >= user.maxPositions) return

  const totalSpent = await prisma.trade.aggregate({
    where: { userId: user.id, status: { in: ['bought', 'listed'] } },
    _sum: { buyPrice: true }
  })
  if ((totalSpent._sum.buyPrice ?? 0) + priceEth > user.budgetMaxEth) return

  const { tradeId } = await buyToken({
    wallet,
    userId: user.id,
    token: `${collectionAddress}:${tokenId}`,
    collection: collectionAddress,
    tokenId,
    buyPrice: priceEth,
    isPaperTrade: user.paperTrading
  })

  await listAfterSnipe({ wallet, user, tradeId, collection: collectionAddress, tokenId, buyPrice: priceEth })
}

module.exports = { onNewListing }
