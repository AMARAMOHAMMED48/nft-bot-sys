require('dotenv').config()
const { ethers } = require('ethers')
const prisma = require('./src/lib/prisma')
const { decrypt } = require('./src/lib/crypto')

const COLLECTION    = '0x8d2071a02608f337baae8da64f93b37abd6bde39'
const OPENSEA_CONDUIT = '0x1E0049783F008A0085193E00003D00cd54003c71'
const USER_EMAIL    = 'admin@nftbot.com'

const ERC721_ABI = [
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)'
]

async function main() {
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } })
  const privateKey = decrypt(user.walletKeyEnc)
  const provider = new ethers.JsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  )
  const wallet = new ethers.Wallet(privateKey, provider)

  const contract = new ethers.Contract(COLLECTION, ERC721_ABI, wallet)

  const approved = await contract.isApprovedForAll(wallet.address, OPENSEA_CONDUIT)
  console.log(`Wallet   : ${wallet.address}`)
  console.log(`Conduit  : ${OPENSEA_CONDUIT}`)
  console.log(`Approuvé : ${approved}`)

  if (approved) {
    console.log('\n✅ Déjà approuvé — le listing devrait fonctionner')
  } else {
    console.log('\n⏳ Approbation en cours (transaction on-chain)...')
    const tx = await contract.setApprovalForAll(OPENSEA_CONDUIT, true)
    console.log(`TX hash : ${tx.hash}`)
    await tx.wait()
    console.log('✅ Approuvé ! Relance test-listing.js maintenant.')
  }

  await prisma.$disconnect()
}

main().catch(console.error)
