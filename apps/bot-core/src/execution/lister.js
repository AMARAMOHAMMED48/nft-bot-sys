const axios = require('axios')
const { ethers } = require('ethers')
const prisma = require('../lib/prisma')
const { notify } = require('../notify')

const SEAPORT_ADDRESS  = '0x0000000000000068F116a894984e2DB1123eB395'
const OPENSEA_CONDUIT  = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'
const OPENSEA_FEE_ADDR = '0x0000a26b00c1F0DF003000390027140000fAa719'

// Types EIP-712 Seaport (identiques offres + listings)
const SEAPORT_TYPES = {
  OrderComponents: [
    { name: 'offerer',    type: 'address' },
    { name: 'zone',       type: 'address' },
    { name: 'offer',      type: 'OfferItem[]' },
    { name: 'consideration', type: 'ConsiderationItem[]' },
    { name: 'orderType',  type: 'uint8' },
    { name: 'startTime',  type: 'uint256' },
    { name: 'endTime',    type: 'uint256' },
    { name: 'zoneHash',   type: 'bytes32' },
    { name: 'salt',       type: 'uint256' },
    { name: 'conduitKey', type: 'bytes32' },
    { name: 'counter',    type: 'uint256' }
  ],
  OfferItem: [
    { name: 'itemType',              type: 'uint8' },
    { name: 'token',                 type: 'address' },
    { name: 'identifierOrCriteria',  type: 'uint256' },
    { name: 'startAmount',           type: 'uint256' },
    { name: 'endAmount',             type: 'uint256' }
  ],
  ConsiderationItem: [
    { name: 'itemType',              type: 'uint8' },
    { name: 'token',                 type: 'address' },
    { name: 'identifierOrCriteria',  type: 'uint256' },
    { name: 'startAmount',           type: 'uint256' },
    { name: 'endAmount',             type: 'uint256' },
    { name: 'recipient',             type: 'address' }
  ]
}

async function getAllFees(collectionAddress) {
  try {
    const contractRes = await axios.get(
      `https://api.opensea.io/api/v2/chain/ethereum/contract/${collectionAddress}`,
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY }, timeout: 8000 }
    )
    const slug = contractRes.data.collection
    if (!slug) return []

    const colRes = await axios.get(
      `https://api.opensea.io/api/v2/collections/${slug}`,
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY }, timeout: 8000 }
    )
    // Retourne TOUS les fees required (OpenSea fee + royalties obligatoires)
    return (colRes.data.fees || [])
      .filter(f => f.required)
      .map(f => ({ bps: Math.round(f.fee * 100), recipient: f.recipient }))
  } catch {
    // Fallback : 1% OpenSea fee minimum
    return [{ bps: 100, recipient: '0x0000a26b00c1F0DF003000390027140000fAa719' }]
  }
}

async function listToken({ wallet, user, tradeId, collection, tokenId, listPrice, isPaperTrade, listExpiryMin = 1440 }) {
  const label = isPaperTrade ? ' [PAPER]' : ''

  if (isPaperTrade) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { listPrice, status: 'listed', listedAt: new Date() }
    })
    if (user) await notify(user, `📋 LISTING${label} | ${collection} #${tokenId}\nPrix: ${listPrice} ETH`)
    return { txHash: null }
  }

  try {
    const listPriceWei = ethers.parseEther(listPrice.toString())

    // Fees de la collection (OpenSea fee + royalties required)
    const fees = await getAllFees(collection)
    let totalFeesWei = 0n
    const feeItems = fees.map(f => {
      const feeWei = listPriceWei * BigInt(f.bps) / 10000n
      totalFeesWei += feeWei
      return {
        itemType: 0,
        token: ethers.ZeroAddress,
        identifierOrCriteria: '0',
        startAmount: feeWei.toString(),
        endAmount: feeWei.toString(),
        recipient: f.recipient
      }
    })

    const sellerAmount = listPriceWei - totalFeesWei
    const minutes   = Math.max(listExpiryMin ?? 1440, 15) // minimum 15 min
    const startTime = Math.floor(Date.now() / 1000).toString()
    const endTime   = (Math.floor(Date.now() / 1000) + minutes * 60).toString()
    const salt         = Math.floor(Math.random() * 1e15).toString()

    // Consideration : seller en premier, puis fees
    const consideration = [
      {
        itemType: 0,
        token: ethers.ZeroAddress,
        identifierOrCriteria: '0',
        startAmount: sellerAmount.toString(),
        endAmount: sellerAmount.toString(),
        recipient: wallet.address
      },
      ...feeItems
    ]

    const SIGNED_ZONE = '0x000056f7000000ece9003ca63978907a00ffd100'

    const buildOrder = (orderType, zone) => ({
      offerer:    wallet.address,
      zone,
      offer: [{
        itemType: 2,  // ERC721
        token: collection,
        identifierOrCriteria: tokenId,
        startAmount: '1',
        endAmount:   '1'
      }],
      consideration,
      orderType,
      startTime,
      endTime,
      zoneHash:   ethers.ZeroHash,
      salt,
      conduitKey: OPENSEA_CONDUIT,
      totalOriginalConsiderationItems: consideration.length,
      counter:    '0'
    })

    const domain = { name: 'Seaport', version: '1.6', chainId: 1, verifyingContract: SEAPORT_ADDRESS }

    const trySubmit = async (orderType, zone) => {
      const orderParams = buildOrder(orderType, zone)
      const signature = await wallet.signTypedData(domain, SEAPORT_TYPES, orderParams)
      return axios.post(
        'https://api.opensea.io/api/v2/orders/ethereum/seaport/listings',
        { parameters: orderParams, signature, protocol_address: SEAPORT_ADDRESS },
        { headers: { 'x-api-key': process.env.OPENSEA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
      )
    }

    let submitRes
    try {
      submitRes = await trySubmit(0, ethers.ZeroAddress)  // FULL_OPEN
    } catch (firstErr) {
      const firstMsg = firstErr.response?.data?.errors?.[0] || firstErr.message
      if (firstMsg?.includes('Signed Zone')) {
        console.log(`[lister] Collection requiert SignedZone — retry FULL_RESTRICTED`)
        submitRes = await trySubmit(2, SIGNED_ZONE)       // FULL_RESTRICTED
      } else {
        throw firstErr
      }
    }

    const orderId = submitRes.data.listing?.order_hash ?? submitRes.data.order?.order_hash

    await prisma.trade.update({
      where: { id: tradeId },
      data: { listPrice, sellTxHash: orderId, status: 'listed', listedAt: new Date() }
    })

    console.log(`[lister] ✅ Listé ${collection} #${tokenId} à ${listPrice} ETH | order: ${orderId}`)
    if (user) await notify(user, `📋 LISTING${label} | ${collection} #${tokenId}\nPrix: ${listPrice} ETH | Order: ${orderId?.slice(0, 10)}...`)
    return { txHash: orderId }

  } catch (err) {
    const errMsg = err.response?.data?.errors?.[0] || err.response?.data?.error?.message || err.message
    await prisma.botLog.create({
      data: { userId: null, level: 'error', module: 'list', message: `Erreur listing: ${errMsg}` }
    })
    throw new Error(errMsg)
  }
}

module.exports = { listToken }
