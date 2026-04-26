require('dotenv').config()
const prisma = require('./src/lib/prisma')
const { decrypt } = require('./src/lib/crypto')
const { ethers } = require('ethers')
const { listToken } = require('./src/execution/lister')

// ── Configure ici ──────────────────────────────
const COLLECTION  = '0x8d2071a02608f337baae8da64f93b37abd6bde39' // adresse contrat
const TOKEN_ID    = '2357'   // ex: "1234"
const LIST_PRICE  = 0.4             // prix de listing en ETH
const USER_EMAIL  = 'admin@nftbot.com'
// ───────────────────────────────────────────────

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } })
  if (!user?.walletKeyEnc) return console.error('Wallet non configuré')

  const privateKey = decrypt(user.walletKeyEnc)
  const provider = new ethers.JsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  )
  const wallet = new ethers.Wallet(privateKey, provider)

  console.log(`Wallet: ${wallet.address}`)
  console.log(`Token: ${COLLECTION} #${TOKEN_ID}`)
  console.log(`Prix: ${LIST_PRICE} ETH`)
  console.log('Listing en cours...')

  // Crée un trade temporaire en DB
  const trade = await prisma.trade.create({
    data: {
      userId: user.id,
      tokenId: TOKEN_ID,
      collection: COLLECTION,
      source: 'offer_accepted',
      buyPrice: 0,
      status: 'bought',
      isPaperTrade: false
    }
  })

  try {
    const { txHash } = await listToken({
      wallet,
      listExpiryMin: 15,
      tradeId: trade.id,
      collection: COLLECTION,
      tokenId: TOKEN_ID,
      listPrice: LIST_PRICE,
      isPaperTrade: false
    })

    console.log(`✅ Listing réussi !`)
    console.log(`Order hash: ${txHash}`)
    console.log(`Vérifie sur OpenSea: https://opensea.io/assets/ethereum/${COLLECTION}/${TOKEN_ID}`)
  } catch (err) {
    console.error('❌ Erreur listing:', err.response?.data?.errors?.[0] || err.message)
    // Nettoie le trade de test
    await prisma.trade.delete({ where: { id: trade.id } })
  }

  await prisma.$disconnect()
}

main()
