const axios = require('axios')
const prisma = require('../lib/prisma')

const floorCache = new Map()

async function fetchAlchemyFloor(collectionAddress) {
  try {
    const res = await axios.get(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getFloorPrice`,
      { params: { contractAddress: collectionAddress }, timeout: 8000 }
    )
    const osFloor = res.data.openSea?.floorPrice ?? null
    const lrFloor = res.data.looksRare?.floorPrice ?? null
    const candidates = [osFloor, lrFloor].filter(v => v !== null && v > 0)
    return candidates.length ? Math.min(...candidates) : null
  } catch {
    return null
  }
}

async function fetchBlurFloor(collectionAddress) {
  try {
    const res = await axios.get(
      `https://api.blur.io/v1/collections/${collectionAddress.toLowerCase()}`,
      { headers: { Accept: 'application/json' }, timeout: 8000 }
    )
    const fp = res.data.collection?.floorPrice?.amount
    return fp ? parseFloat(fp) : null
  } catch {
    return null
  }
}

async function fetchReservoirFloor(collectionAddress) {
  try {
    const res = await axios.get(
      `https://api.reservoir.tools/collections/v7`,
      {
        params: { id: collectionAddress, limit: 1 },
        headers: { 'x-api-key': process.env.RESERVOIR_API_KEY },
        timeout: 8000
      }
    )
    const fp = res.data.collections?.[0]?.floorAsk?.price?.amount?.native
    return fp ? parseFloat(fp) : null
  } catch {
    return null
  }
}

async function fetchFloor(collectionAddress) {
  const [alchemy, blur] = await Promise.all([
    fetchAlchemyFloor(collectionAddress),
    fetchBlurFloor(collectionAddress)
  ])

  let candidates = [alchemy, blur].filter(v => v !== null && v > 0)

  // Fallback Reservoir si les deux sources principales sont vides
  let reservoir = null
  if (!candidates.length) {
    reservoir = await fetchReservoirFloor(collectionAddress)
    if (reservoir && reservoir > 0) candidates = [reservoir]
  }

  if (!candidates.length) return

  const floor = Math.min(...candidates)
  floorCache.set(collectionAddress, floor)

  await prisma.floorSnapshot.create({
    data: { collection: collectionAddress, floorPrice: floor, volume24h: null, listings: null }
  }).catch(() => {})

  const src = reservoir && !alchemy && !blur ? 'reservoir' : `alchemy:${alchemy ?? '—'} blur:${blur ?? '—'}`
  console.log(`[floor] ${collectionAddress.slice(0, 10)}... → ${floor} ETH (${src})`)
}

const polledCollections = new Set()

async function startFloorPoller(collections) {
  for (const addr of collections) polledCollections.add(addr)
  const poll = () => Promise.all([...polledCollections].map(fetchFloor))
  await poll()
  setInterval(poll, 60_000)
}

function addCollection(address) {
  if (polledCollections.has(address)) return
  polledCollections.add(address)
  fetchFloor(address) // fetch immédiat
  console.log(`[floor] Nouvelle collection ajoutée au poller: ${address.slice(0, 10)}...`)
}

function getFloor(collectionAddress) {
  return floorCache.get(collectionAddress) ?? null
}

module.exports = { startFloorPoller, addCollection, getFloor, fetchFloor }
