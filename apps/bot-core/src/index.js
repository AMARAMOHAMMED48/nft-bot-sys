require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const prisma = require('./lib/prisma')
const { connect, addCollection: addEventCollection } = require('./data/events')
const { startFloorPoller, addCollection: addFloorCollection } = require('./data/floorPrice')
const { startGasPoller } = require('./data/gasPrice')
const { startEngine, stopEngine, isRunning } = require('./engine/walletEngine')

async function bootstrap() {
  const allCollections = await prisma.userCollection.findMany({
    where: { enabled: true },
    select: { collectionAddress: true },
    distinct: ['collectionAddress']
  })
  const addresses = allCollections.map(c => c.collectionAddress)

  startGasPoller()
  await startFloorPoller(addresses)
  connect(addresses)

  console.log(`[bot-core] Connecté — ${addresses.length} collection(s) surveillée(s)`)

  const activeUsers = await prisma.user.findMany({
    where: { botEnabled: true, walletKeyEnc: { not: null } }
  })
  for (const user of activeUsers) startEngine(user)

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

    // Nouvelles collections ajoutées depuis le démarrage
    const currentCollections = await prisma.userCollection.findMany({
      where: { enabled: true },
      select: { collectionAddress: true },
      distinct: ['collectionAddress']
    })
    for (const col of currentCollections) {
      addFloorCollection(col.collectionAddress)
      addEventCollection(col.collectionAddress)
    }
  }, 30_000)
}

bootstrap().catch(err => {
  console.error('[bot-core] Erreur fatale:', err)
  process.exit(1)
})
