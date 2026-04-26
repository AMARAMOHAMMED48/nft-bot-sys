const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.get('/status', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { botEnabled: true, walletAddress: true, paperTrading: true }
  })

  const activeOffers = await prisma.offer.count({
    where: { userId: req.user.id, status: 'active' }
  })

  const pnlData = await prisma.trade.aggregate({
    where: { userId: req.user.id, status: 'sold' },
    _sum: { pnl: true }
  })

  const latestFloor = await prisma.floorSnapshot.findFirst({
    orderBy: { recordedAt: 'desc' },
    select: { floorPrice: true, collection: true, recordedAt: true }
  })

  res.json({
    isRunning: user.botEnabled,
    walletAddress: user.walletAddress,
    paperTrading: user.paperTrading,
    activeOffers,
    totalPnl: parseFloat((pnlData._sum.pnl ?? 0).toFixed(6)),
    latestFloor
  })
})

router.post('/start', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { walletKeyEnc: true, offerBelowFloor: true }
  })

  if (!user.walletKeyEnc) {
    return res.status(400).json({ error: 'Wallet non configuré' })
  }
  if (!user.offerBelowFloor) {
    return res.status(400).json({ error: '"Sous le floor" non configuré' })
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { botEnabled: true }
  })

  res.json({ ok: true, message: 'Bot démarré' })
})

router.post('/pause', async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { botEnabled: false }
  })
  res.json({ ok: true, message: 'Bot mis en pause' })
})

router.post('/resume', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { walletKeyEnc: true }
  })

  if (!user.walletKeyEnc) {
    return res.status(400).json({ error: 'Wallet non configuré' })
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { botEnabled: true }
  })

  res.json({ ok: true, message: 'Bot relancé' })
})

module.exports = router
