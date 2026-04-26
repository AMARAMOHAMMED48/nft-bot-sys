const axios = require('axios')

// Ce module est utilisé uniquement comme référence de format.
// Les notifications sont envoyées directement par le bot-core via user.discordWebhook.
// Garder ce fichier pour les formats de messages standardisés.

const FORMATS = {
  offerPlaced: ({ collectionName, price, floor, active, maxActive, weth, isPaper }) => {
    const label = isPaper ? ' [PAPER]' : ''
    const pct = (((price / floor) - 1) * 100).toFixed(1)
    return [
      `✅ OFFRE${label} | ${collectionName}`,
      `Prix: ${price} ETH | Floor: ${floor} ETH (${pct}%)`,
      `Offres actives: ${active}/${maxActive} | WETH: ${weth} ETH | Expire: 24h`
    ].join('\n')
  },

  offerAccepted: ({ collectionName, tokenId, buyPrice, listPrice, isPaper }) => {
    const label = isPaper ? ' [PAPER]' : ''
    const profit = listPrice - buyPrice
    const pct = ((profit / buyPrice) * 100).toFixed(1)
    return [
      `🎯 OFFRE ACCEPTÉE${label} | ${collectionName} #${tokenId}`,
      `Acheté: ${buyPrice} ETH → Listé: ${listPrice} ETH (floor)`,
      `Profit potentiel: +${profit.toFixed(3)} ETH (+${pct}%)`
    ].join('\n')
  },

  snipe: ({ collectionName, tokenId, buyPrice, listPrice, isPaper }) => {
    const label = isPaper ? ' [PAPER]' : ''
    const pct = (((buyPrice / listPrice) - 1) * 100).toFixed(1)
    return [
      `🟢 SNIPE${label} | ${collectionName} #${tokenId}`,
      `Acheté: ${buyPrice} ETH (${pct}% floor) → Listé: ${listPrice} ETH`
    ].join('\n')
  },

  sold: ({ collectionName, tokenId, buyPrice, sellPrice, pnl }) => {
    const emoji = pnl >= 0 ? '✅' : '❌'
    return [
      `💰 VENDU | ${collectionName} #${tokenId}`,
      `${buyPrice} → ${sellPrice} ETH | P&L net: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} ETH ${emoji}`
    ].join('\n')
  },

  stopLoss: ({ pnl }) => [
    `🔴 STOP-LOSS | Bot arrêté automatiquement`,
    `Perte: ${pnl.toFixed(4)} ETH | Action requise sur le front.`
  ].join('\n')
}

async function send(webhookUrl, message) {
  if (!webhookUrl) return
  await axios.post(webhookUrl, { content: message })
}

module.exports = { FORMATS, send }
