const express = require('express')
const { ethers } = require('ethers')
const { encrypt } = require('../lib/crypto')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.post('/', async (req, res) => {
  const { privateKey } = req.body
  if (!privateKey) return res.status(400).json({ error: 'Clé privée requise' })

  try {
    const wallet = new ethers.Wallet(privateKey)
    const walletKeyEnc = encrypt(privateKey)

    await prisma.user.update({
      where: { id: req.user.id },
      data: { walletAddress: wallet.address, walletKeyEnc }
    })

    res.json({ address: wallet.address })
  } catch {
    res.status(400).json({ error: 'Clé privée invalide' })
  }
})

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { walletAddress: true, walletKeyEnc: true }
  })
  res.json({ address: user.walletAddress, hasKey: !!user.walletKeyEnc })
})

router.delete('/', async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { walletAddress: null, walletKeyEnc: null, botEnabled: false }
  })
  res.json({ ok: true })
})

module.exports = router
