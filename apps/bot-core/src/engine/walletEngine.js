const prisma = require('../lib/prisma')
const { loadWallet } = require('../execution/wallet')
const { runOfferCycle } = require('./offerEngine')
const { checkStopLoss, checkExpiredListings, onSale } = require('./riskManager')
const { on } = require('../data/events')
const { startPositionMonitor } = require('../monitor/positions')

const activeEngines = new Map()

function startEngine(user) {
  if (activeEngines.has(user.id)) return

  const { wallet } = loadWallet(user.walletKeyEnc)

  const interval = setInterval(async () => {
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

    await checkExpiredListings({ wallet, user: freshUser })

    await runOfferCycle({ wallet, user: freshUser })
  }, 60_000)

  activeEngines.set(user.id, { interval, wallet })

  // Ventes détectées via polling OpenSea
  on('sale', data => onSale({ wallet, user, saleData: data }))

  // Moniteur wallet — détecte les offres acceptées
  startPositionMonitor({ wallet, user })

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
