const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const collections = await prisma.userCollection.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  })
  res.json(collections)
})

router.post('/', async (req, res) => {
  const { collectionAddress, collectionName } = req.body
  if (!collectionAddress || !collectionName) {
    return res.status(400).json({ error: 'Adresse et nom requis' })
  }

  try {
    const collection = await prisma.userCollection.create({
      data: { userId: req.user.id, collectionAddress, collectionName }
    })
    res.status(201).json(collection)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Collection déjà ajoutée' })
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/:id', async (req, res) => {
  const { enabled, offerBelowFloorPct, stopLossPct, offerExpiryMin } = req.body
  const data = {}
  if (enabled !== undefined) data.enabled = enabled
  if (offerBelowFloorPct !== undefined) data.offerBelowFloorPct = offerBelowFloorPct === '' ? null : parseFloat(offerBelowFloorPct)
  if (stopLossPct !== undefined) data.stopLossPct = stopLossPct === '' ? null : parseFloat(stopLossPct)
  if (offerExpiryMin !== undefined) data.offerExpiryMin = offerExpiryMin === '' ? null : parseInt(offerExpiryMin)

  try {
    const collection = await prisma.userCollection.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data
    })
    if (!collection.count) return res.status(404).json({ error: 'Collection introuvable' })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/:id', async (req, res) => {
  const deleted = await prisma.userCollection.deleteMany({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!deleted.count) return res.status(404).json({ error: 'Collection introuvable' })
  res.json({ ok: true })
})

module.exports = router
