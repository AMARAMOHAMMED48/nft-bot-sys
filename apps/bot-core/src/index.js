require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const prisma = require('./lib/prisma')
const { connect, addCollection: addEventCollection } = require('./data/events')
const { startFloorPoller, addCollection: addFloorCollection } = require('./data/floorPrice')
const { startGasPoller } = require('./data/gasPrice')
const { startEngine, stopEngine, isRunning } = require('./engine/walletEngine')
const { startSnipeEngine, stopSnipeEngine, isSnipeRunning } = require('./engine/snipeEngine')

async function bootstrap() {
  const allCollections = await prisma.userCollection.findMany({
    where: { enabled: true },
    select: { collectionAddress: true },
    distinct: ['collectionAddress']
  })
  const addresses = allCollections.map(c => c.collectionAddress)

  // Ajouter aussi les collections avec trades actifs (même désactivées) pour le floor poller
  const activeTradeCols = await prisma.trade.findMany({
    where: { status: { in: ['bought', 'listed', 'stop_loss'] } },
    select: { collection: true },
    distinct: ['collection']
  })
  const allAddresses = [...new Set([...addresses, ...activeTradeCols.map(t => t.collection)])]

  startGasPoller()
  await startFloorPoller(allAddresses)
  connect(addresses)  // events seulement sur les collections actives

  console.log(`[bot-core] Connecté — ${addresses.length} collection(s) surveillée(s)`)

  const activeUsers = await prisma.user.findMany({
    where: { botEnabled: true, walletKeyEnc: { not: null } }
  })
  for (const user of activeUsers) startEngine(user)

  // Snipe engine — indépendant du bot d'offres
  const snipeUsers = await prisma.user.findMany({
    where: { snipeConfig: { enabled: true, walletKeyEnc: { not: null } } }
  })
  for (const user of snipeUsers) startSnipeEngine(user)

  // Polling toutes les 30s : users + nouvelles collections
  setInterval(async () => {
    // Users
    const users = await prisma.user.findMany({
      where: { walletKeyEnc: { not: null } }
    })
    for (const user of users) {
      if (user.botEnabled && !isRunning(user.id)) startEngine(user)
      else if (!user.botEnabled && isRunning(user.id)) stopEngine(user.id)
    }

    // Nouvelles collections actives → floor + events
    const currentCollections = await prisma.userCollection.findMany({
      where: { enabled: true },
      select: { collectionAddress: true },
      distinct: ['collectionAddress']
    })
    for (const col of currentCollections) {
      addFloorCollection(col.collectionAddress)
      addEventCollection(col.collectionAddress)
    }

    // Sync snipe engines
    const allUsers = await prisma.user.findMany({ where: { walletKeyEnc: { not: null } } })
    for (const user of allUsers) {
      const sc = await prisma.snipeConfig.findUnique({ where: { userId: user.id } })
      if (sc?.enabled && sc?.walletKeyEnc && !isSnipeRunning(user.id)) startSnipeEngine(user)
      else if ((!sc?.enabled || !sc?.walletKeyEnc) && isSnipeRunning(user.id)) stopSnipeEngine(user.id)
    }

    // Collections désactivées mais avec trades actifs → floor uniquement (pour relist/stop-loss)
    const tradeCollections = await prisma.trade.findMany({
      where: { status: { in: ['bought', 'listed', 'stop_loss'] } },
      select: { collection: true },
      distinct: ['collection']
    })
    for (const t of tradeCollections) {
      addFloorCollection(t.collection)
    }
  }, 30_000)
}

bootstrap().catch(err => {
  console.error('[bot-core] Erreur fatale:', err)
  process.exit(1)
})
