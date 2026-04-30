'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type Status = {
  isRunning: boolean
  walletAddress: string | null
  paperTrading: boolean
  activeOffers: number
  totalPnl: number
}

type Config = {
  offerBelowFloorPct: number | null
  budgetMaxEth: number
  stopLossPct: number
  paperTrading: boolean
}

type Floor = {
  collectionId: string
  collectionAddress: string
  collectionName: string
  floorPrice: number | null
  volume24h: number | null
  change1h: number | null
  updatedAt: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [wallet, setWallet] = useState<{ address: string | null; hasKey: boolean } | null>(null)
  const [floors, setFloors] = useState<Floor[]>([])
  const [privateKey, setPrivateKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    try {
      const [s, c, w, f] = await Promise.all([
        api.getStatus(), api.getConfig(), api.getWallet(), api.getFloors()
      ])
      setStatus(s)
      setConfig(c)
      setWallet(w)
      setFloors(f)
    } catch {
      router.push('/login')
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  async function handleAddWallet(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.addWallet(privateKey)
      setPrivateKey('')
      setMsg('Wallet ajouté')
      load()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleBotToggle() {
    if (!status) return
    try {
      if (status.isRunning) await api.pauseBot()
      else await api.resumeBot()
      load()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (!status || !config || !wallet) return <div style={styles.loading}>Chargement...</div>

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.logo}>NFT Bot</span>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={{ ...styles.navLink, color: '#c4b5fd' }}>Dashboard</a>
          <a href="/offers" style={styles.navLink}>Offres</a>
          <a href="/trades" style={styles.navLink}>Trades</a>
          <a href="/config" style={styles.navLink}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>

        {/* Cards résumé */}
        <div style={styles.grid4}>
          <Card label="P&L Total"
            value={`${status.totalPnl >= 0 ? '+' : ''}${status.totalPnl.toFixed(4)} ETH`}
            color={status.totalPnl >= 0 ? '#22c55e' : '#f87171'} />
          <Card label="Offres actives" value={`${status.activeOffers}`} />
          <Card label="Mode" value={config.paperTrading ? 'PAPER' : 'RÉEL'}
            color={config.paperTrading ? '#f59e0b' : '#22c55e'} />
          <Card label="Bot" value={status.isRunning ? 'Actif' : 'Arrêté'}
            color={status.isRunning ? '#22c55e' : '#f87171'} />
        </div>

        {/* Floor prices par collection */}
        {floors.length > 0 && (
          <Section title="Floor prices">
            <div style={styles.floorGrid}>
              {floors.map(f => (
                <div key={f.collectionId} style={styles.floorCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={styles.floorName}>{f.collectionName}</p>
                      <p style={styles.floorAddr}>{f.collectionAddress.slice(0, 10)}...</p>
                    </div>
                    {f.change1h !== null && (
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: f.change1h >= 0 ? '#14532d' : '#450a0a',
                        color: f.change1h >= 0 ? '#22c55e' : '#f87171'
                      }}>
                        {f.change1h >= 0 ? '+' : ''}{f.change1h}% 1h
                      </span>
                    )}
                  </div>

                  <p style={styles.floorPrice}>
                    {f.floorPrice !== null ? `${f.floorPrice} ETH` : '—'}
                  </p>

                  {config.offerPriceEth && f.floorPrice && (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                      Offre: {config.offerPriceEth} ETH
                      ({((config.offerPriceEth / f.floorPrice) * 100).toFixed(1)}% du floor)
                    </p>
                  )}

                  {f.volume24h && (
                    <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                      Vol 24h: {f.volume24h.toFixed(2)} ETH
                    </p>
                  )}

                  {f.updatedAt && (
                    <p style={{ fontSize: 10, color: '#475569', margin: '4px 0 0' }}>
                      Mis à jour: {new Date(f.updatedAt).toLocaleTimeString('fr-FR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Bot control */}
        <Section title="Contrôle bot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: status.isRunning ? '#22c55e' : '#f87171', fontWeight: 600 }}>
              {status.isRunning ? '● Actif' : '● Arrêté'}
            </span>
            {wallet.hasKey && (
              <button style={{ ...styles.btn, background: status.isRunning ? '#f87171' : '#22c55e' }}
                onClick={handleBotToggle}>
                {status.isRunning ? 'Pause' : 'Démarrer'}
              </button>
            )}
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              Budget: {config.budgetMaxEth} ETH max | Stop-loss: -{config.stopLossPct}%
            </span>
          </div>
        </Section>

        {/* Wallet */}
        <Section title="Wallet">
          {wallet.hasKey ? (
            <div>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 8px' }}>Adresse connectée :</p>
              <code style={styles.code}>{status.walletAddress}</code>
              <button style={{ ...styles.btn, background: '#ef4444', marginTop: 12 }}
                onClick={async () => { await api.deleteWallet(); load() }}>
                Supprimer le wallet
              </button>
            </div>
          ) : (
            <form onSubmit={handleAddWallet} style={styles.form}>
              <input style={styles.input} type="password" placeholder="Clé privée (0x...)"
                value={privateKey} onChange={e => setPrivateKey(e.target.value)} required />
              <button style={styles.btn} type="submit" disabled={saving}>
                {saving ? 'Ajout...' : 'Ajouter wallet'}
              </button>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>Chiffrée AES-256 — jamais exposée</p>
            </form>
          )}
        </Section>

        {msg && <p style={styles.msg}>{msg}</p>}
      </main>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardLabel}>{label}</p>
      <p style={{ ...styles.cardValue, color: color || '#e2e8f0' }}>{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' },
  page: { minHeight: '100vh' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid #1e1e3a', background: '#12121f' },
  logo: { fontSize: 20, fontWeight: 700, color: '#7c3aed' },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: '#94a3b8', textDecoration: 'none', fontSize: 14 },
  main: { maxWidth: 960, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  card: { background: '#1a1a2e', borderRadius: 10, padding: '20px 24px', border: '1px solid #2d2d4e' },
  cardLabel: { color: '#94a3b8', fontSize: 13, margin: '0 0 8px' },
  cardValue: { fontSize: 22, fontWeight: 700, margin: 0 },
  section: { background: '#1a1a2e', borderRadius: 10, padding: 24, border: '1px solid #2d2d4e' },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 16px', color: '#c4b5fd' },
  floorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  floorCard: { background: '#0f0f1a', borderRadius: 8, padding: 16, border: '1px solid #1e1e3a', display: 'flex', flexDirection: 'column', gap: 4 },
  floorName: { margin: 0, fontWeight: 600, fontSize: 14, color: '#e2e8f0' },
  floorAddr: { margin: 0, fontSize: 11, color: '#475569', fontFamily: 'monospace' },
  floorPrice: { margin: '8px 0 4px', fontSize: 24, fontWeight: 700, color: '#7c3aed' },
  row: { display: 'flex', alignItems: 'center', gap: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 14 },
  btn: { padding: '10px 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: 'fit-content' },
  code: { display: 'block', background: '#0f0f13', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' },
  msg: { color: '#22c55e', fontSize: 14, margin: 0 }
}
