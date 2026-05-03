'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Status = {
  isRunning: boolean
  walletAddress: string | null
  paperTrading: boolean
  activeOffers: number
  totalPnl: number
}

type Config = {
  budgetMaxEth: number
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
      setStatus(s); setConfig(c); setWallet(w); setFloors(f)
    } catch { router.push('/login') }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
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
    } finally { setSaving(false) }
  }

  async function handleBotToggle() {
    if (!status) return
    try {
      if (status.isRunning) await api.pauseBot()
      else await api.resumeBot()
      load()
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
  }

  if (!status || !config || !wallet) return (
    <div className="page-loading"><span className="spinner" />Chargement...</div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={S.main}>

        <div style={S.grid4}>
          <StatCard label="P&L Total"
            value={`${status.totalPnl >= 0 ? '+' : ''}${status.totalPnl.toFixed(4)} ETH`}
            color={status.totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
          <StatCard label="Offres actives" value={`${status.activeOffers}`} />
          <StatCard label="Mode"
            value={config.paperTrading ? 'PAPER' : 'RÉEL'}
            color={config.paperTrading ? 'var(--amber)' : 'var(--green)'} />
          <StatCard label="Bot"
            value={status.isRunning ? 'Actif' : 'Arrêté'}
            color={status.isRunning ? 'var(--green)' : 'var(--red)'} />
        </div>

        {floors.length > 0 && (
          <Section title="Floor prices">
            <div style={S.floorGrid}>
              {floors.map(f => (
                <div key={f.collectionId} style={S.floorCard} className="fade-in">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{f.collectionName}</p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--dim)', fontFamily: 'monospace', marginTop: 2 }}>
                        {f.collectionAddress.slice(0, 10)}…
                      </p>
                    </div>
                    {f.change1h !== null && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: f.change1h >= 0 ? '#14532d' : '#450a0a',
                        color: f.change1h >= 0 ? 'var(--green)' : 'var(--red)'
                      }}>
                        {f.change1h >= 0 ? '+' : ''}{f.change1h}% 1h
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '10px 0 4px', fontSize: 24, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
                    {f.floorPrice !== null ? `${f.floorPrice} ETH` : '—'}
                  </p>
                  {f.volume24h && (
                    <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>
                      Vol 24h: {f.volume24h.toFixed(2)} ETH
                    </p>
                  )}
                  {f.updatedAt && (
                    <p style={{ fontSize: 10, color: 'var(--dim)', margin: '4px 0 0' }}>
                      {new Date(f.updatedAt).toLocaleTimeString('fr-FR')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Contrôle bot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <span className={`dot${status.isRunning ? ' dot-pulse' : ''}`}
                style={{ background: status.isRunning ? 'var(--green)' : 'var(--red)' }} />
              {status.isRunning ? 'Actif' : 'Arrêté'}
            </span>
            {wallet.hasKey && (
              <button className="btn"
                style={{ background: status.isRunning ? 'var(--red)' : 'var(--green)', color: '#fff' }}
                onClick={handleBotToggle}>
                {status.isRunning ? 'Pause' : 'Démarrer'}
              </button>
            )}
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Budget: {config.budgetMaxEth} ETH max</span>
          </div>
        </Section>

        <Section title="Wallet">
          {wallet.hasKey ? (
            <div>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Adresse connectée</p>
              <code className="code-block">{status.walletAddress}</code>
              <button className="btn" style={{ background: '#ef4444', color: '#fff', marginTop: 14 }}
                onClick={async () => { await api.deleteWallet(); load() }}>
                Supprimer le wallet
              </button>
            </div>
          ) : (
            <form onSubmit={handleAddWallet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" type="password" placeholder="Clé privée (0x…)"
                value={privateKey} onChange={e => setPrivateKey(e.target.value)} required />
              <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }}
                type="submit" disabled={saving}>
                {saving ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />Ajout...</> : 'Ajouter wallet'}
              </button>
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>Chiffrée AES-256 — jamais exposée</p>
            </form>
          )}
        </Section>

        {msg && <p style={{ color: 'var(--green)', fontSize: 14, margin: 0 }}>{msg}</p>}
      </main>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <p style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 500, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: color ?? 'var(--text)', letterSpacing: '-0.3px' }}>
        {value}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 980, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 20 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  floorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  floorCard: { background: 'var(--bg-deep)', borderRadius: 8, padding: 16, border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 4 },
}
