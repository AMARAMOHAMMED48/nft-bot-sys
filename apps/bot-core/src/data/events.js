const axios = require('axios')

const handlers = { sale: [], listing: [], offer_accepted: [] }
const lastChecked = new Map()

function on(event, fn) {
  if (handlers[event]) handlers[event].push(fn)
}

function emit(event, data) {
  handlers[event]?.forEach(fn => fn(data))
}

// ─── OpenSea polling ──────────────────────────────────────────────────────────

async function pollOpenSea(collectionAddress) {
  if (!process.env.OPENSEA_API_KEY) return

  const after = lastChecked.get(`os:${collectionAddress}`) || Math.floor(Date.now() / 1000) - 120

  try {
    const res = await axios.get('https://api.opensea.io/api/v2/events/chain/ethereum', {
      params: {
        asset_contract_address: collectionAddress,
        event_type: 'sale',
        after,
        limit: 20
      },
      headers: { 'x-api-key': process.env.OPENSEA_API_KEY },
      timeout: 10000
    })

    for (const ev of res.data.asset_events || []) {
      const priceWei = ev.payment?.quantity ? BigInt(ev.payment.quantity) : null
      const priceEth = priceWei ? Number(priceWei) / 1e18 : null

      emit('sale', {
        token: { tokenId: ev.nft?.identifier },
        collection: { id: collectionAddress },
        price: { amount: { native: priceEth } }
      })
    }

    lastChecked.set(`os:${collectionAddress}`, Math.floor(Date.now() / 1000))
  } catch {
    // silent
  }
}

async function pollOpenSeaListings(collectionAddress) {
  if (!process.env.OPENSEA_API_KEY) return

  try {
    const res = await axios.get(
      `https://api.opensea.io/api/v2/listings/collection/${collectionAddress}/best`,
      {
        params: { limit: 10 },
        headers: { 'x-api-key': process.env.OPENSEA_API_KEY },
        timeout: 10000
      }
    )

    for (const listing of res.data.listings || []) {
      const priceWei = listing.price?.current?.value
      const priceEth = priceWei ? Number(BigInt(priceWei)) / 1e18 : null
      const tokenId = listing.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria

      if (!priceEth || !tokenId) continue

      emit('listing', {
        token: { tokenId },
        collection: { id: collectionAddress },
        price: { amount: { native: priceEth } },
        source: 'opensea'
      })
    }
  } catch {
    // silent
  }
}

// ─── Blur polling ─────────────────────────────────────────────────────────────

async function pollBlurListings(collectionAddress) {
  try {
    const res = await axios.get(
      `https://api.blur.io/v1/collections/${collectionAddress.toLowerCase()}/tokens`,
      {
        params: { filters: JSON.stringify({ traits: [], hasAsks: true }), limit: 10 },
        headers: { Accept: 'application/json' },
        timeout: 10000
      }
    )

    for (const token of res.data.tokens || []) {
      const priceEth = token.price ? parseFloat(token.price) : null
      const tokenId = token.tokenId

      if (!priceEth || !tokenId) continue

      emit('listing', {
        token: { tokenId },
        collection: { id: collectionAddress },
        price: { amount: { native: priceEth } },
        source: 'blur'
      })
    }
  } catch {
    // silent
  }
}

// ─── Démarrage polling ────────────────────────────────────────────────────────

const activeCollections = new Set()

function connect(collections) {
  for (const addr of collections) activeCollections.add(addr)

  console.log(`[events] Polling démarré — ${activeCollections.size} collection(s) | OpenSea + Blur`)

  setInterval(() => [...activeCollections].forEach(pollOpenSea), 30_000)
  setInterval(() => {
    ;[...activeCollections].forEach(pollOpenSeaListings)
    ;[...activeCollections].forEach(pollBlurListings)
  }, 20_000)

  ;[...activeCollections].forEach(pollOpenSea)
  ;[...activeCollections].forEach(pollOpenSeaListings)
  ;[...activeCollections].forEach(pollBlurListings)
}

function addCollection(address) {
  if (activeCollections.has(address)) return
  activeCollections.add(address)
  pollOpenSea(address)
  pollOpenSeaListings(address)
  pollBlurListings(address)
  console.log(`[events] Nouvelle collection surveillée: ${address.slice(0, 10)}...`)
}

module.exports = { connect, addCollection, on }
