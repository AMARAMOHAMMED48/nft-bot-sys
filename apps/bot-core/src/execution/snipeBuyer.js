const axios = require('axios')
const { ethers } = require('ethers')
const prisma = require('../lib/prisma')

const SEAPORT_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395'

async function buyToken({ wallet, userId, collection, tokenId, buyPrice, isPaperTrade }) {
  if (isPaperTrade) {
    const trade = await prisma.trade.create({
      data: { userId, tokenId, collection, source: 'snipe', buyPrice, status: 'bought', isPaperTrade: true }
    })
    return { tradeId: trade.id, txHash: null }
  }

  try {
    const listingRes = await axios.get(
      `https://api.opensea.io/api/v2/listings/collection/${collection}/nfts/${tokenId}/best`,
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY }, timeout: 10000 }
    )
    const listing = listingRes.data.listing
    if (!listing) throw new Error('Aucun listing trouvé')

    const fulfillRes = await axios.post(
      'https://api.opensea.io/api/v2/listings/fulfillment_data',
      {
        listing: { hash: listing.order_hash, protocol_address: SEAPORT_ADDRESS, chain: 'ethereum' },
        fulfiller: { address: wallet.address }
      },
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY, 'Content-Type': 'application/json' } }
    )

    const txData = fulfillRes.data.fulfillment_data.transaction
    const tx = await wallet.sendTransaction({
      to: txData.to,
      data: txData.input_data.data,
      value: BigInt(txData.value || '0')
    })
    const receipt = await tx.wait()

    const trade = await prisma.trade.create({
      data: {
        userId, tokenId, collection, source: 'snipe',
        buyPrice, buyTxHash: receipt.hash,
        gasBuy: parseFloat(ethers.formatEther(receipt.gasUsed * receipt.gasPrice)),
        status: 'bought', isPaperTrade: false
      }
    })
    return { tradeId: trade.id, txHash: receipt.hash }
  } catch (err) {
    await prisma.botLog.create({
      data: { userId, level: 'error', module: 'snipe', message: `Échec achat snipe ${collection} #${tokenId}: ${err.message}` }
    })
    throw err
  }
}

module.exports = { buyToken }
