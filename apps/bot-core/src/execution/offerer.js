const axios = require('axios')
const { ethers } = require('ethers')
const prisma = require('../lib/prisma')

const SEAPORT_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const slugCache = new Map()
const feesCache = new Map()

async function resolveSlug(contractAddress) {
  if (slugCache.has(contractAddress)) return slugCache.get(contractAddress)

  const res = await axios.get(
    `https://api.opensea.io/api/v2/chain/ethereum/contract/${contractAddress}`,
    { headers: { 'x-api-key': process.env.OPENSEA_API_KEY }, timeout: 10000 }
  )

  const slug = res.data.collection
  if (!slug) throw new Error(`Slug introuvable pour ${contractAddress}`)
  slugCache.set(contractAddress, slug)
  return slug
}

// Retourne [{recipient, basisPoints}] pour OpenSea + creator fees
async function getCollectionFees(slug) {
  if (feesCache.has(slug)) return feesCache.get(slug)

  const res = await axios.get(
    `https://api.opensea.io/api/v2/collections/${slug}`,
    { headers: { 'x-api-key': process.env.OPENSEA_API_KEY }, timeout: 10000 }
  )

  const fees = (res.data.fees || []).map(f => ({
    recipient: f.recipient,
    basisPoints: f.fee  // ex: 250 = 2.5%
  }))

  feesCache.set(slug, fees)
  return fees
}

function buildConsideration(offerAmountWeiBI, fees) {
  return fees.map(({ recipient, basisPoints }) => {
    const amount = (offerAmountWeiBI * BigInt(basisPoints) / 10000n).toString()
    return {
      itemType: 1,
      token: WETH,
      identifierOrCriteria: '0',
      startAmount: amount,
      endAmount: amount,
      recipient
    }
  })
}

async function placeOffer({ wallet, userId, collection, offerPrice, floorPrice, isPaperTrade, expiryMinutes = 1440 }) {
  const minutes = Math.max(expiryMinutes ?? 1440, 10) // minimum 10 min (requis par OpenSea)
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000)

  if (isPaperTrade) {
    const offer = await prisma.offer.create({
      data: { userId, collection, offerPrice, floorAtOffer: floorPrice, status: 'active', isPaperTrade: true, expiresAt }
    })
    return { offerId: offer.id, txHash: null }
  }

  try {
    const slug = await resolveSlug(collection)
    const offerAmountWei = ethers.parseEther(offerPrice.toString()).toString()
    const offerAmountWeiBI = BigInt(offerAmountWei)
    const expireTimestamp = Math.floor(expiresAt.getTime() / 1000).toString()
    const startTime = Math.floor(Date.now() / 1000).toString()

    const buildRes = await axios.post(
      'https://api.opensea.io/api/v2/offers/build',
      {
        offerer: wallet.address,
        quantity: 1,
        criteria: { collection: { slug } },
        protocol_address: SEAPORT_ADDRESS
      },
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
    )

    const partial = buildRes.data.partialParameters

    // Récupère OpenSea fees + creator fees depuis l'API collection
    const fees = await getCollectionFees(slug)
    const consideration = buildConsideration(offerAmountWeiBI, fees)

    const orderParams = {
      offerer: wallet.address,
      zone: partial.zone || ethers.ZeroAddress,
      offer: [{
        itemType: 1,
        token: WETH,
        identifierOrCriteria: '0',
        startAmount: offerAmountWei,
        endAmount: offerAmountWei
      }],
      consideration,
      orderType: 2,
      startTime,
      endTime: expireTimestamp,
      zoneHash: partial.zoneHash || ethers.ZeroHash,
      salt: partial.salt ? BigInt(partial.salt).toString() : '0',
      conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
      totalOriginalConsiderationItems: consideration.length,
      counter: '0'
    }

    // Types EIP-712 Seaport
    const types = {
      OrderComponents: [
        { name: 'offerer', type: 'address' },
        { name: 'zone', type: 'address' },
        { name: 'offer', type: 'OfferItem[]' },
        { name: 'consideration', type: 'ConsiderationItem[]' },
        { name: 'orderType', type: 'uint8' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'zoneHash', type: 'bytes32' },
        { name: 'salt', type: 'uint256' },
        { name: 'conduitKey', type: 'bytes32' },
        { name: 'counter', type: 'uint256' }
      ],
      OfferItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' }
      ],
      ConsiderationItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' }
      ]
    }

    const domain = { name: 'Seaport', version: '1.6', chainId: 1, verifyingContract: SEAPORT_ADDRESS }
    const signature = await wallet.signTypedData(domain, types, orderParams)

    const submitRes = await axios.post(
      'https://api.opensea.io/api/v2/offers',
      {
        criteria: { collection: { slug } },
        protocol_address: SEAPORT_ADDRESS,
        protocol_data: { parameters: orderParams, signature }
      },
      { headers: { 'x-api-key': process.env.OPENSEA_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
    )

    const orderId = submitRes.data.order_hash

    const offer = await prisma.offer.create({
      data: { userId, collection, offerPrice, floorAtOffer: floorPrice, offerTxHash: orderId, status: 'active', isPaperTrade: false, expiresAt }
    })

    return { offerId: offer.id, txHash: orderId }
  } catch (err) {
    await prisma.botLog.create({
      data: { userId, level: 'error', module: 'offer', message: `Erreur placement offre: ${err.response?.data?.errors?.[0] || err.message}` }
    })
    throw err
  }
}

async function cancelOffer({ wallet, offerId, isPaperTrade }) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } })
  if (!offer || offer.status !== 'active') return

  if (!isPaperTrade && offer.offerTxHash) {
    try {
      await axios.post(
        'https://api.opensea.io/api/v2/orders/cancel',
        { order_hashes: [offer.offerTxHash], protocol_address: SEAPORT_ADDRESS },
        { headers: { 'x-api-key': process.env.OPENSEA_API_KEY, 'Content-Type': 'application/json' } }
      )
    } catch { }
  }

  await prisma.offer.update({ where: { id: offerId }, data: { status: 'cancelled' } })
}

module.exports = { placeOffer, cancelOffer, resolveSlug }
