const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 200)
  const { status, isPaperTrade, collection } = req.query

  const where = { userId: req.user.id }
  if (status && status !== 'all') where.status = status
  if (isPaperTrade !== undefined) where.isPaperTrade = isPaperTrade === 'true'
  if (collection) where.collection = { equals: collection, mode: 'insensitive' }

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { boughtAt: 'desc' },
    take: limit
  })
  res.json(trades)
})

router.get('/pnl', async (req, res) => {
  const trades = await prisma.trade.findMany({
    where: { userId: req.user.id, status: 'sold' },
    select: { pnl: true, isPaperTrade: true }
  })

  const total = await prisma.trade.count({ where: { userId: req.user.id } })
  const sold = trades.length
  const wins = trades.filter(t => (t.pnl ?? 0) > 0).length
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0)
  const paperTrades = trades.filter(t => t.isPaperTrade).length

  res.json({
    totalPnl: parseFloat(totalPnl.toFixed(6)),
    winRate: sold > 0 ? parseFloat(((wins / sold) * 100).toFixed(1)) : 0,
    totalTrades: total,
    soldTrades: sold,
    paperTrades
  })
})

module.exports = router
