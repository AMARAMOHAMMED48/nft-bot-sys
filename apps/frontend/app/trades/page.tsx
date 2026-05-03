'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Trade = {
  id: string
  tokenId: string
  collection: string
  collectionName: string | null
  source: string
  buyPrice: number
  sellPrice: number | null
  listPrice: number | null
  pnl: number | null
  status: string
  isPaperTrade: boolean
  boughtAt: string
  soldAt: string | null
}

type Pnl = {
  totalPnl: number
  winRate: number
  totalTrades: number
  soldTrades: number
  paperTrades: number
}

const STATUS_COLOR: Record<string, string> = {
  bought:       'var(--amber)',
  listed:       'var(--accent)',
  sold:         'var(--green)',
  stop_loss:    'var(--red)',
  timeout_sold: 'var(--muted)',
}

const STATUS_LABEL: Record<string, string> = {
  all:       'Tous',
  bought:    'Acheté',
  listed:    'Listé',
  sold:      'Vendu',
  stop_loss: 'Stop-loss',
}

export default function TradesPage() {
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [pnl, setPnl] = useState<Pnl | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState<'all' | 'paper' | 'real'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'offer_accepted' | 'snipe'>('all')
  const [colFilter, setColFilter] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    try {
      const [t, p] = await Promise.all([api.getTrades(), api.getPnl()])
      setTrades(t); setPnl(p)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const collections = Array.from(
    new Map(trades.map(t => [t.collection.toLowerCase(), { addr: t.collection, name: t.collectionName }])).values()
  ).sort((a, b) => (a.name ?? a.addr).localeCompare(b.name ?? b.addr))

  const filtered = trades.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (modeFilter === 'paper' && !t.isPaperTrade) return false
    if (modeFilter === 'real' && t.isPaperTrade) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    if (colFilter && t.collection.toLowerCase() !== colFilter) return false
    if (search && !t.tokenId.includes(search)) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={S.main}>

        {pnl && (
          <div style={S.grid4}>
            <StatCard label="P&L Total"
              value={`${pnl.totalPnl >= 0 ? '+' : ''}${pnl.totalPnl.toFixed(4)} ETH`}
              color={pnl.totalPnl >= 0 ? 'var(--green)' : 'var(--red)'} />
            <StatCard label="Win Rate" value={`${pnl.winRate}%`}
              color={pnl.winRate > 60 ? 'var(--green)' : 'var(--red)'} />
            <StatCard label="Trades vendus" value={`${pnl.soldTrades}`} />
            <StatCard label="Paper trades" value={`${pnl.paperTrades}`} color="var(--amber)" />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Historique des trades</h1>
          <span style={{ color: 'var(--dim)', fontSize: 13 }}>{filtered.length} / {trades.length}</span>
        </div>

        <div style={S.filters}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(STATUS_LABEL).map(([val, label]) => (
              <button key={val} className="btn-filter" style={{
                background: statusFilter === val ? 'var(--accent-dim)' : 'var(--bg-card)',
                color: statusFilter === val ? 'var(--accent-light)' : 'var(--muted)',
                borderColor: statusFilter === val ? 'var(--accent)' : 'var(--border)',
              }} onClick={() => setStatusFilter(val)}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'Tous'], ['paper', 'Paper'], ['real', 'Réel']] as const).map(([val, label]) => (
              <button key={val} className="btn-filter" style={{
                background: modeFilter === val ? (val === 'paper' ? '#92400e' : val === 'real' ? '#14532d' : 'var(--accent)') : 'var(--bg-card)',
                color: modeFilter === val ? '#fff' : 'var(--muted)',
                borderColor: modeFilter === val ? 'transparent' : 'var(--border)',
              }} onClick={() => setModeFilter(val)}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'Toutes sources'], ['offer_accepted', 'Offre'], ['snipe', 'Snipe']] as const).map(([val, label]) => (
              <button key={val} className="btn-filter" style={{
                background: sourceFilter === val ? '#1e3a5f' : 'var(--bg-card)',
                color: sourceFilter === val ? 'var(--blue)' : 'var(--muted)',
                borderColor: sourceFilter === val ? '#1d4ed8' : 'var(--border)',
              }} onClick={() => setSourceFilter(val)}>{label}</button>
            ))}
          </div>

          <select className="select" value={colFilter} onChange={e => setColFilter(e.target.value)}>
            <option value="">Toutes collections</option>
            {collections.map(c => (
              <option key={c.addr} value={c.addr.toLowerCase()}>
                {c.name ?? `${c.addr.slice(0, 8)}…${c.addr.slice(-4)}`}
              </option>
            ))}
          </select>

          <input className="input" style={{ width: 120 }} placeholder="Token ID…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', padding: '20px 0' }}>
            <span className="spinner" />Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aucun trade</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="thead" style={S.cols}>
              <span>Collection</span><span>Source</span><span>Achat</span>
              <span>Listing</span><span>Vente</span><span>P&L</span>
              <span>Statut</span><span>Mode</span><span>Date</span>
            </div>
            {filtered.map(t => (
              <div key={t.id} className="trow" style={{ ...S.cols, padding: '12px 14px', background: 'var(--bg-card)', borderLeft: `3px solid ${STATUS_COLOR[t.status] ?? 'var(--border)'}` }}>
                <span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {t.collectionName ?? `${t.collection.slice(0, 8)}…`}
                  </span>
                  <br />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>#{t.tokenId}</span>
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {t.source === 'snipe' ? '⚡ snipe' : '🎯 offre'}
                </span>
                <span>{t.buyPrice} ETH</span>
                <span style={{ color: 'var(--muted)' }}>{t.listPrice ? `${t.listPrice} ETH` : '—'}</span>
                <span style={{ color: 'var(--muted)' }}>{t.sellPrice ? `${t.sellPrice} ETH` : '—'}</span>
                <span style={{ color: t.pnl == null ? 'var(--muted)' : t.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {t.pnl == null ? '—' : `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}`}
                </span>
                <span style={{ color: STATUS_COLOR[t.status] ?? 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                  {t.status}
                </span>
                <span style={{ color: t.isPaperTrade ? 'var(--amber)' : 'var(--green)', fontSize: 12 }}>
                  {t.isPaperTrade ? 'PAPER' : 'RÉEL'}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(t.boughtAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        )}
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

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1240, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 18 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  filters: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  cols: { display: 'grid', gridTemplateColumns: '0.8fr 0.7fr 0.9fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.8fr', alignItems: 'center' },
}
