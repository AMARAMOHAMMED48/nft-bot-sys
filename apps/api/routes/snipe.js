const express = require('express')
const { ethers } = require('ethers')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/crypto')

const router = express.Router()
router.use(authMiddleware)

const SNIPE_CONFIG_FIELDS = ['paperTrading', 'enabled', 'budgetMaxEth', 'maxGasGwei', 'maxPositions', 'ethReserveGas', 'discordWebhook']

async function getOrCreateSnipeConfig(userId) {
  return prisma.snipeConfig.upsert({
    where: { userId },
    create: { userId },
    update: {}
  })
}

router.get('/config', async (req, res) => {
  const config = await getOrCreateSnipeConfig(req.user.id)
  res.json(config)
})

router.put('/config', async (req, res) => {
  const data = {}
  for (const field of SNIPE_CONFIG_FIELDS) {
    if (req.body[field] !== undefined) data[field] = req.body[field]
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucun champ valide' })

  const config = await prisma.snipeConfig.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, ...data },
    update: data
  })
  res.json(config)
})

router.get('/wallet', async (req, res) => {
  const config = await prisma.snipeConfig.findUnique({ where: { userId: req.user.id } })
  res.json({ address: config?.walletAddress ?? null, hasKey: !!config?.walletKeyEnc })
})

router.post('/wallet', async (req, res) => {
  const { privateKey } = req.body
  if (!privateKey) return res.status(400).json({ error: 'Clé privée requise' })
  try {
    const wallet = new ethers.Wallet(privateKey)
    const walletKeyEnc = encrypt(privateKey)
    await prisma.snipeConfig.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, walletAddress: wallet.address, walletKeyEnc },
      update: { walletAddress: wallet.address, walletKeyEnc }
    })
    res.json({ address: wallet.address })
  } catch {
    res.status(400).json({ error: 'Clé privée invalide' })
  }
})

router.delete('/wallet', async (req, res) => {
  await prisma.snipeConfig.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id },
    update: { walletAddress: null, walletKeyEnc: null, enabled: false }
  })
  res.json({ ok: true })
})

router.post('/start', async (req, res) => {
  const config = await prisma.snipeConfig.findUnique({ where: { userId: req.user.id } })
  if (!config?.walletKeyEnc) return res.status(400).json({ error: 'Wallet snipe non configuré' })

  const snipeCollections = await prisma.userCollection.count({
    where: { userId: req.user.id, snipeEnabled: true }
  })
  if (!snipeCollections) return res.status(400).json({ error: 'Aucune collection avec snipe activé' })

  await prisma.snipeConfig.update({ where: { userId: req.user.id }, data: { enabled: true } })
  res.json({ ok: true, message: 'Snipe démarré' })
})

router.post('/pause', async (req, res) => {
  await prisma.snipeConfig.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, enabled: false },
    update: { enabled: false }
  })
  res.json({ ok: true, message: 'Snipe mis en pause' })
})

module.exports = router
