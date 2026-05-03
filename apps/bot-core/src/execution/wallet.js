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

  const [balanceWei, feeData] = await Promise.all([
    wallet.provider.getBalance(wallet.address),
    wallet.provider.getFeeData()
  ])
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice

  // Estimer le gas avec 1 wei pour éviter INSUFFICIENT_FUNDS sur l'estimation elle-même
  const gasLimit = await weth.deposit.estimateGas({ value: 1n })
  const gasCostWei = gasPrice * gasLimit

  const maxWrapWei = balanceWei - gasCostWei
  if (maxWrapWei <= 0n) throw new Error(`ETH insuffisant pour couvrir le gas du wrap (${ethers.formatEther(gasCostWei)} ETH)`)

  const requestedWei = ethers.parseEther(amountEth.toFixed(18))
  const finalWei = requestedWei > maxWrapWei ? maxWrapWei : requestedWei

  const tx = await weth.deposit({ value: finalWei, gasLimit })
  await tx.wait()
  return { txHash: tx.hash, amountWrapped: parseFloat(ethers.formatEther(finalWei)) }
}

module.exports = { loadWallet, getWethBalance, getEthBalance, wrapEthToWeth }
