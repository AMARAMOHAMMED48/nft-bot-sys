const prisma = require('../lib/prisma')
const { loadWallet } = require('../execution/wallet')
const { runOfferCycle } = require('./offerEngine')
const { onNewListing } = require('./buyEngine')
const { checkStopLoss, onSale } = require('./riskManager')
const { on } = require('../data/events')
const { startPositionMonitor } = require('../monitor/positions')

const activeEngines = new Map()

function startEngine(user) {
  if (activeEngines.has(user.id)) return

  const { wallet } = loadWallet(user.walletKeyEnc)

  const interval = setInterval(async () => {
    // Recharge le user depuis la DB à chaque cycle (config toujours à jour)
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!freshUser || !freshUser.botEnabled) {
      stopEngine(user.id)
      return
    }

    const stopped = await checkStopLoss(freshUser)
    if (stopped) {
      stopEngine(freshUser.id)
      return
    }

    await runOfferCycle({ wallet, user: freshUser })
  }, 60_000)

  activeEngines.set(user.id, { interval, wallet })

  on('listing', data => onNewListing({ wallet, user, listing: data }))
  on('sale', data => onSale({ user, saleData: data }))

  startPositionMonitor({ wallet, user })

  // Premier cycle immédiat avec user frais
  prisma.user.findUnique({ where: { id: user.id } }).then(freshUser => {
    if (freshUser) runOfferCycle({ wallet, user: freshUser })
  })

  console.log(`[walletEngine] Démarré pour ${user.email} (${user.walletAddress})`)
}

function stopEngine(userId) {
  const engine = activeEngines.get(userId)
  if (!engine) return
  clearInterval(engine.interval)
  activeEngines.delete(userId)
  console.log(`[walletEngine] Arrêté pour userId ${userId}`)
}

function isRunning(userId) {
  return activeEngines.has(userId)
}

module.exports = { startEngine, stopEngine, isRunning }
