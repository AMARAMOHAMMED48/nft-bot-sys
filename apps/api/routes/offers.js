const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const { status, isPaperTrade } = req.query
  const where = { userId: req.user.id }
  if (status && status !== 'all') where.status = status
  else if (!status) where.status = 'active'
  if (isPaperTrade !== undefined) where.isPaperTrade = isPaperTrade === 'true'

  const offers = await prisma.offer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200
  })

  // Enrichit avec le nom de la collection
  const collections = await prisma.userCollection.findMany({
    where: { userId: req.user.id },
    select: { collectionAddress: true, collectionName: true }
  })
  const nameMap = Object.fromEntries(
    collections.map(c => [c.collectionAddress.toLowerCase(), c.collectionName])
  )

  const enriched = offers.map(o => ({
    ...o,
    collectionName: nameMap[o.collection.toLowerCase()] ?? null
  }))

  res.json(enriched)
})

router.delete('/:id', async (req, res) => {
  const offer = await prisma.offer.findFirst({
    where: { id: req.params.id, userId: req.user.id }
  })
  if (!offer) return res.status(404).json({ error: 'Offre introuvable' })
  if (offer.status !== 'active') return res.status(400).json({ error: 'Offre non annulable' })

  // Émet la commande d'annulation vers le bot-core via un flag DB
  await prisma.offer.update({
    where: { id: req.params.id },
    data: { status: 'cancelled' }
  })

  res.json({ ok: true })
})

module.exports = router
