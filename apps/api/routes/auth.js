const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { authLimiter } = require('../middleware/rateLimit')

const router = express.Router()

router.post('/register', authLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' })
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 chars min)' })

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, role: true }
    })
    res.status(201).json({ user })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email déjà utilisé' })
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' })

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.status(401).json({ error: 'Identifiants invalides' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' })

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000
    })

    res.json({ user: { id: user.id, email: user.email, role: user.role } })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' })
  res.json({ ok: true })
})

module.exports = router
