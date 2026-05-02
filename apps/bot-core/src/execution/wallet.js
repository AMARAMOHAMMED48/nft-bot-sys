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
  const valueWei = ethers.parseEther(amountEth.toFixed(18))

  // Estimation dynamique du gas pour ne jamais manquer de fonds
  const [feeData, gasLimit] = await Promise.all([
    wallet.provider.getFeeData(),
    weth.deposit.estimateGas({ value: valueWei })
  ])
  const gasCostWei = (feeData.maxFeePerGas ?? feeData.gasPrice) * gasLimit

  // Réduit le montant si le gas empiète sur la valeur à wrapper
  const balanceWei = await wallet.provider.getBalance(wallet.address)
  const maxWrapWei = balanceWei - gasCostWei
  if (maxWrapWei <= 0n) throw new Error(`ETH insuffisant pour couvrir le gas du wrap (${ethers.formatEther(gasCostWei)} ETH)`)

  const finalWei = valueWei > maxWrapWei ? maxWrapWei : valueWei
  const tx = await weth.deposit({ value: finalWei, gasLimit })
  const receipt = await tx.wait()
  return { txHash: tx.hash, amountWrapped: parseFloat(ethers.formatEther(finalWei)) }
}

module.exports = { loadWallet, getWethBalance, getEthBalance, wrapEthToWeth }
