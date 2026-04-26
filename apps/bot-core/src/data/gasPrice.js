const axios = require('axios')

let currentGwei = 30

async function fetchGasPrice() {
  try {
    // Alchemy eth_gasPrice via JSON-RPC
    const res = await axios.post(
      `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 },
      { timeout: 5000 }
    )
    const hex = res.data.result
    const gwei = parseInt(hex, 16) / 1e9
    currentGwei = parseFloat(gwei.toFixed(2))
  } catch {
    // conserve la dernière valeur connue
  }
}

function startGasPoller() {
  fetchGasPrice()
  setInterval(fetchGasPrice, 30_000)
}

function getGasGwei() {
  return currentGwei
}

module.exports = { startGasPoller, getGasGwei }
