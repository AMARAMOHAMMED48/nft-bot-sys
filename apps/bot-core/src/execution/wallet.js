const { ethers } = require('ethers')
const { decrypt } = require('../lib/crypto')

const WETH_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function deposit() payable',
  'function withdraw(uint256)'
]
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

function loadWallet(walletKeyEnc) {
  const privateKey = decrypt(walletKeyEnc)
  const provider = new ethers.JsonRpcProvider(
    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  )
  const wallet = new ethers.Wallet(privateKey, provider)
  return { wallet, provider }
}

async function getWethBalance(wallet) {
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet)
  const bal = await weth.balanceOf(wallet.address)
  return parseFloat(ethers.formatEther(bal))
}

async function getEthBalance(wallet) {
  const bal = await wallet.provider.getBalance(wallet.address)
  return parseFloat(ethers.formatEther(bal))
}

async function wrapEthToWeth(wallet, amountEth) {
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet)
  const tx = await weth.deposit({ value: ethers.parseEther(amountEth.toString()) })
  const receipt = await tx.wait()
  return { txHash: tx.hash, blockNumber: receipt.blockNumber }
}

module.exports = { loadWallet, getWethBalance, getEthBalance, wrapEthToWeth }
