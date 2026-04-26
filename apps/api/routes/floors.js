const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  const collections = await prisma.userCollection.findMany({
    where: { userId: req.user.id, enabled: true }
  })

  const floors = await Promise.all(collections.map(async col => {
    // Dernier snapshot
    const latest = await prisma.floorSnapshot.findFirst({
      where: { collection: col.collectionAddress },
      orderBy: { recordedAt: 'desc' }
    })

    // Snapshot d'il y a 1h pour calculer la variation
    const oneHourAgo = new Date(Date.now() - 3600 * 1000)
    const previous = await prisma.floorSnapshot.findFirst({
      where: { collection: col.collectionAddress, recordedAt: { lt: oneHourAgo } },
      orderBy: { recordedAt: 'desc' }
    })

    const change1h = latest && previous
      ? ((latest.floorPrice - previous.floorPrice) / previous.floorPrice) * 100
      : null

    return {
      collectionId: col.id,
      collectionAddress: col.collectionAddress,
      collectionName: col.collectionName,
      floorPrice: latest?.floorPrice ?? null,
      volume24h: latest?.volume24h ?? null,
      change1h: change1h !== null ? parseFloat(change1h.toFixed(2)) : null,
      updatedAt: latest?.recordedAt ?? null
    }
  }))

  res.json(floors)
})

module.exports = router
