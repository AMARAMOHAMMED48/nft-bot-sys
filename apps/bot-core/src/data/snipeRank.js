const axios = require('axios')

async function fetchTokenRank(collectionAddress, tokenId) {
  try {
    const res = await axios.get('https://api.reservoir.tools/tokens/v7', {
      params: { tokens: `${collectionAddress}:${tokenId}`, limit: 1 },
      headers: { 'x-api-key': process.env.RESERVOIR_API_KEY },
      timeout: 6000
    })
    return res.data.tokens?.[0]?.token?.rarity?.rank ?? null
  } catch {
    return null
  }
}

module.exports = { fetchTokenRank }
