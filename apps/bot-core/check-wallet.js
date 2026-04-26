require('dotenv').config()
const axios = require('axios')
const prisma = require('./src/lib/prisma')
const { decrypt } = require('./src/lib/crypto')
const { ethers } = require('ethers')

const USER_EMAIL = 'admin@nftbot.com'

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } })
  if (!user?.walletKeyEnc) return console.error('Wallet non configuré')

  const privateKey = decrypt(user.walletKeyEnc)
  const wallet = new ethers.Wallet(privateKey)
  console.log(`Wallet: ${wallet.address}\n`)

  // Tous les NFTs du wallet sans filtre de collection
  const res = await axios.get(
    `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}/getNFTsForOwner`,
    {
      params: { owner: wallet.address, withMetadata: true, pageSize: 50 },
      timeout: 10000
    }
  )

  const nfts = res.data.ownedNfts || []
  if (!nfts.length) {
    console.log('❌ Aucun NFT dans ce wallet')
  } else {
    console.log(`✅ ${nfts.length} NFT(s) trouvé(s) :\n`)
    nfts.forEach(n => {
      console.log(`  Collection : ${n.contract.name || '?'} (${n.contract.address})`)
      console.log(`  Token ID   : ${n.tokenId}`)
      console.log(`  Nom        : ${n.name || '?'}`)
      console.log(`  ─────────────────────────────`)
    })
  }

  await prisma.$disconnect()
}

main()
