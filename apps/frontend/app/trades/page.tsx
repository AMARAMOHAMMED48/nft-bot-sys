'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type Trade = {
  id: string
  tokenId: string
  collection: string
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

const STATUS_COLORS: Record<string, string> = {
  bought:    '#f59e0b',
  listed:    '#7c3aed',
  sold:      '#22c55e',
  stop_loss: '#f87171',
  timeout_sold: '#94a3b8',
}

const STATUS_LABELS: Record<string, string> = {
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
      setTrades(t)
      setPnl(p)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const collections = Array.from(new Set(trades.map(t => t.collection))).sort()

  const filtered = trades.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (modeFilter === 'paper' && !t.isPaperTrade) return false
    if (modeFilter === 'real' && t.isPaperTrade) return false
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false
    if (colFilter && t.collection.toLowerCase() !== colFilter.toLowerCase()) return false
    if (search && !t.tokenId.includes(search)) return false
    return true
  })

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.logo}>NFT Bot</a>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="/offers" style={styles.navLink}>Offres</a>
          <a href="/trades" style={{ ...styles.navLink, color: '#c4b5fd' }}>Trades</a>
          <a href="/logs" style={styles.navLink}>Logs</a>
          <a href="/config" style={styles.navLink}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>

        {pnl && (
          <div style={styles.grid4}>
            <Card label="P&L Total"
              value={`${pnl.totalPnl >= 0 ? '+' : ''}${pnl.totalPnl.toFixed(4)} ETH`}
              color={pnl.totalPnl >= 0 ? '#22c55e' : '#f87171'} />
            <Card label="Win Rate" value={`${pnl.winRate}%`}
              color={pnl.winRate > 60 ? '#22c55e' : '#f87171'} />
            <Card label="Trades vendus" value={`${pnl.soldTrades}`} />
            <Card label="Paper trades" value={`${pnl.paperTrades}`} color="#f59e0b" />
          </div>
        )}

        <div style={styles.topBar}>
          <h1 style={styles.h1}>Historique des trades</h1>
          <span style={styles.count}>{filtered.length} / {trades.length}</span>
        </div>

        {/* Filtres */}
        <div style={styles.filters}>
          {/* Statut */}
          <div style={styles.btnGroup}>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <button key={val} style={{
                ...styles.filterBtn,
                background: statusFilter === val ? '#7c3aed' : '#1a1a2e',
                color: statusFilter === val ? '#fff' : '#94a3b8',
                borderColor: statusFilter === val ? '#7c3aed' : '#2d2d4e',
              }} onClick={() => setStatusFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          {/* Mode */}
          <div style={styles.btnGroup}>
            {([['all', 'Tous'], ['paper', 'Paper'], ['real', 'Réel']] as const).map(([val, label]) => (
              <button key={val} style={{
                ...styles.filterBtn,
                background: modeFilter === val ? (val === 'paper' ? '#92400e' : val === 'real' ? '#14532d' : '#7c3aed') : '#1a1a2e',
                color: modeFilter === val ? '#fff' : '#94a3b8',
                borderColor: modeFilter === val ? 'transparent' : '#2d2d4e',
              }} onClick={() => setModeFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          {/* Source */}
          <div style={styles.btnGroup}>
            {([['all', 'Toutes sources'], ['offer_accepted', 'Offre'], ['snipe', 'Snipe']] as const).map(([val, label]) => (
              <button key={val} style={{
                ...styles.filterBtn,
                background: sourceFilter === val ? '#1e3a5f' : '#1a1a2e',
                color: sourceFilter === val ? '#60a5fa' : '#94a3b8',
                borderColor: sourceFilter === val ? '#1d4ed8' : '#2d2d4e',
              }} onClick={() => setSourceFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          {/* Collection */}
          <select style={styles.select} value={colFilter} onChange={e => setColFilter(e.target.value)}>
            <option value="">Toutes collections</option>
            {collections.map(c => (
              <option key={c} value={c}>{c.slice(0, 8)}...{c.slice(-4)}</option>
            ))}
          </select>

          {/* Token search */}
          <input style={styles.searchInput} placeholder="Token ID..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? <p style={styles.muted}>Chargement...</p> :
          filtered.length === 0 ? <p style={styles.muted}>Aucun trade</p> : (
            <div style={styles.table}>
              <div style={styles.thead}>
                <span>Token</span><span>Source</span><span>Achat</span><span>Listing</span><span>Vente</span><span>P&L</span><span>Statut</span><span>Mode</span><span>Date</span>
              </div>
              {filtered.map(t => (
                <div key={t.id} style={{ ...styles.row, borderLeft: `3px solid ${STATUS_COLORS[t.status] ?? '#2d2d4e'}` }}>
                  <span style={styles.mono}>#{t.tokenId}</span>
                  <span style={styles.muted}>{t.source === 'snipe' ? '🟢 snipe' : '🎯 offre'}</span>
                  <span>{t.buyPrice} ETH</span>
                  <span style={styles.muted}>{t.listPrice ? `${t.listPrice} ETH` : '—'}</span>
                  <span style={styles.muted}>{t.sellPrice ? `${t.sellPrice} ETH` : '—'}</span>
                  <span style={{ color: t.pnl == null ? '#94a3b8' : t.pnl >= 0 ? '#22c55e' : '#f87171' }}>
                    {t.pnl == null ? '—' : `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}`}
                  </span>
                  <span style={{ color: STATUS_COLORS[t.status] ?? '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                    {t.status}
                  </span>
                  <span style={{ color: t.isPaperTrade ? '#f59e0b' : '#22c55e', fontSize: 12 }}>
                    {t.isPaperTrade ? 'PAPER' : 'RÉEL'}
                  </span>
                  <span style={{ ...styles.muted, fontSize: 12 }}>
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

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardLabel}>{label}</p>
      <p style={{ ...styles.cardValue, color: color || '#e2e8f0' }}>{value}</p>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid #1e1e3a', background: '#12121f' },
  logo: { fontSize: 20, fontWeight: 700, color: '#7c3aed', textDecoration: 'none' },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: '#94a3b8', textDecoration: 'none', fontSize: 14 },
  main: { maxWidth: 1200, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  card: { background: '#1a1a2e', borderRadius: 10, padding: '20px 24px', border: '1px solid #2d2d4e' },
  cardLabel: { color: '#94a3b8', fontSize: 13, margin: '0 0 8px' },
  cardValue: { fontSize: 22, fontWeight: 700, margin: 0 },
  topBar: { display: 'flex', alignItems: 'center', gap: 16 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  count: { color: '#64748b', fontSize: 14 },
  filters: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  btnGroup: { display: 'flex', gap: 4 },
  filterBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #2d2d4e', background: '#1a1a2e', color: '#e2e8f0', fontSize: 12 },
  searchInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 12, width: 110 },
  muted: { color: '#94a3b8', fontSize: 14 },
  table: { display: 'flex', flexDirection: 'column', gap: 6 },
  thead: { display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.9fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.8fr', padding: '8px 16px', color: '#64748b', fontSize: 12, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '0.7fr 0.8fr 0.9fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.8fr', padding: '11px 16px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2d2d4e', alignItems: 'center', fontSize: 13 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }
}
