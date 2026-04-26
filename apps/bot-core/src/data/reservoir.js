const WebSocket = require('ws')

let ws = null
const handlers = { sale: [], listing: [], offer_accepted: [] }

function on(event, fn) {
  if (handlers[event]) handlers[event].push(fn)
}

function emit(event, data) {
  handlers[event]?.forEach(fn => fn(data))
}

function connect(collections) {
  const url = `wss://ws.reservoir.tools?api_key=${process.env.RESERVOIR_API_KEY}`

  ws = new WebSocket(url)

  ws.on('open', () => {
    console.log('[reservoir] WebSocket connecté')

    for (const collection of collections) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        event: 'ask.created',
        filters: { contract: collection }
      }))
      ws.send(JSON.stringify({
        type: 'subscribe',
        event: 'sale.created',
        filters: { contract: collection }
      }))
      ws.send(JSON.stringify({
        type: 'subscribe',
        event: 'bid.accepted',
        filters: { contract: collection }
      }))
    }
  })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      const event = msg.event
      const data = msg.data

      if (event === 'ask.created') emit('listing', data)
      if (event === 'sale.created') emit('sale', data)
      if (event === 'bid.accepted') emit('offer_accepted', data)
    } catch {
      // ignore messages malformés
    }
  })

  ws.on('close', () => {
    console.log('[reservoir] WebSocket fermé — reconnexion dans 5s')
    setTimeout(() => connect(collections), 5_000)
  })

  ws.on('error', (err) => {
    console.error('[reservoir] WebSocket erreur:', err.message)
  })
}

module.exports = { connect, on }
