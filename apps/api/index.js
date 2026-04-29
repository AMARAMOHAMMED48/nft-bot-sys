require('dotenv').config()
const express = require('express')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const { limiter } = require('./middleware/rateLimit')

const app = express()

app.set('trust proxy', 1)

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())
app.use(limiter)

app.use('/api/auth',        require('./routes/auth'))
app.use('/api/wallet',      require('./routes/wallet'))
app.use('/api/collections', require('./routes/collections'))
app.use('/api/config',      require('./routes/config'))
app.use('/api/offers',      require('./routes/offers'))
app.use('/api/trades',      require('./routes/trades'))
app.use('/api/bot',         require('./routes/bot'))
app.use('/api/floors',      require('./routes/floors'))

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Erreur interne' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`API running on :${PORT}`))
