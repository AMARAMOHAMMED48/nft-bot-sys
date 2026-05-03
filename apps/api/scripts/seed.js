require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const EMAIL    = process.env.SEED_EMAIL    || 'admin@nftbot.local'
const PASSWORD = process.env.SEED_PASSWORD || 'nftbot123'

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })

  if (existing) {
    console.log(`Compte déjà existant : ${EMAIL}`)
    return
  }

  if (PASSWORD.length < 8) {
    console.error('Mot de passe trop court (8 chars min)')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const user = await prisma.user.create({
    data: { email: EMAIL, passwordHash, role: 'admin' },
    select: { id: true, email: true, role: true }
  })

  console.log(`Compte créé :`)
  console.log(`  Email    : ${user.email}`)
  console.log(`  Password : ${PASSWORD}`)
  console.log(`  Role     : ${user.role}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
