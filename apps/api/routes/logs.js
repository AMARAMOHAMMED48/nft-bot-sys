const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const { level, since, limit = '20' } = req.query
  const where = { userId: req.user.id }
  where.level = level ? level : { in: ['warn', 'error'] }
  if (since) where.createdAt = { gt: new Date(since) }

  const logs = await prisma.botLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(parseInt(limit), 100),
    select: { id: true, level: true, module: true, message: true, createdAt: true }
  })
  res.json(logs)
})

module.exports = router
