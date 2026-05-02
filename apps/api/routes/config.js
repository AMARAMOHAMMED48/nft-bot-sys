const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const prisma = require('../lib/prisma')

const router = express.Router()

router.use(authMiddleware)

const CONFIG_FIELDS = [
  'paperTrading', 'offerBelowFloorPct', 'offerMaxActive', 'offerExpiryMin', 'relistAfterMin',
  'budgetMaxEth', 'stopLossPct', 'maxGasGwei', 'timeoutSellH', 'discordWebhook',
  'autoWrapAfterSale', 'ethReserveGas'
]

router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: Object.fromEntries(CONFIG_FIELDS.map(f => [f, true]))
  })
  res.json(user)
})

router.put('/', async (req, res) => {
  const data = {}
  for (const field of CONFIG_FIELDS) {
    if (req.body[field] !== undefined) data[field] = req.body[field]
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Aucun champ valide fourni' })
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: Object.fromEntries(CONFIG_FIELDS.map(f => [f, true]))
  })
  res.json(user)
})

module.exports = router
