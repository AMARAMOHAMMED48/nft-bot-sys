'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type Offer = {
  id: string
  collection: string
  collectionName: string | null
  offerPrice: number
  floorAtOffer: number
  status: string
  isPaperTrade: boolean
  expiresAt: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  active:    '#22c55e',
  expired:   '#94a3b8',
  cancelled: '#f87171',
  accepted:  '#7c3aed',
}

const STATUS_LABELS: Record<string, string> = {
  all:       'Toutes',
  active:    'Actives',
  expired:   'Expirées',
  cancelled: 'Annulées',
  accepted:  'Acceptées',
}

export default function OffersPage() {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('active')
  const [modeFilter, setModeFilter] = useState<'all' | 'paper' | 'real'>('all')
  const [colFilter, setColFilter] = useState('')

  async function load(status = statusFilter) {
    setLoading(true)
    try {
      const data = await api.getOffers({ status: status === 'all' ? 'all' : status })
      setOffers(data)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(statusFilter) }, [statusFilter])

  async function cancel(id: string) {
    await api.cancelOffer(id)
    load(statusFilter)
  }

  const collections = Array.from(
    new Set(offers.map(o => o.collection))
  ).sort()

  const filtered = offers.filter(o => {
    if (modeFilter === 'paper' && !o.isPaperTrade) return false
    if (modeFilter === 'real' && o.isPaperTrade) return false
    if (colFilter && o.collection.toLowerCase() !== colFilter.toLowerCase()) return false
    return true
  })

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.logo}>NFT Bot</a>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="/offers" style={{ ...styles.navLink, color: '#c4b5fd' }}>Offres</a>
          <a href="/trades" style={styles.navLink}>Trades</a>
          <a href="/logs" style={styles.navLink}>Logs</a>
          <a href="/config" style={styles.navLink}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <h1 style={styles.h1}>Offres</h1>
          <span style={styles.count}>{filtered.length} / {offers.length}</span>
        </div>

        {/* Filtres */}
        <div style={styles.filters}>
          {/* Statut */}
          <div style={styles.btnGroup}>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <button key={val} style={{
                ...styles.filterBtn,
                background: statusFilter === val ? (STATUS_COLORS[val] ? `${STATUS_COLORS[val]}22` : '#3b2f6e') : '#1a1a2e',
                color: statusFilter === val ? (STATUS_COLORS[val] ?? '#c4b5fd') : '#94a3b8',
                borderColor: statusFilter === val ? (STATUS_COLORS[val] ?? '#7c3aed') : '#2d2d4e',
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

          {/* Collection */}
          <select style={styles.select} value={colFilter} onChange={e => setColFilter(e.target.value)}>
            <option value="">Toutes collections</option>
            {collections.map(c => {
              const name = offers.find(o => o.collection === c)?.collectionName
              return <option key={c} value={c}>{name ?? `${c.slice(0, 8)}...${c.slice(-4)}`}</option>
            })}
          </select>
        </div>

        {loading ? <p style={styles.muted}>Chargement...</p> :
          filtered.length === 0 ? <p style={styles.muted}>Aucune offre</p> : (
            <div style={styles.table}>
              <div style={styles.thead}>
                <span>Collection</span><span>Prix offre</span><span>Floor</span><span>%</span><span>Statut</span><span>Mode</span><span>Expire / Créée</span><span></span>
              </div>
              {filtered.map(o => {
                const pct = (((o.offerPrice / o.floorAtOffer) - 1) * 100).toFixed(1)
                const date = statusFilter === 'active'
                  ? `${new Date(o.expiresAt).toLocaleString('fr-FR')}`
                  : `${new Date(o.createdAt).toLocaleDateString('fr-FR')}`
                return (
                  <div key={o.id} style={{ ...styles.row, borderLeft: `3px solid ${STATUS_COLORS[o.status] ?? '#2d2d4e'}` }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {o.collectionName ?? `${o.collection.slice(0, 8)}...`}
                    </span>
                    <span style={{ color: '#7c3aed' }}>{o.offerPrice} ETH</span>
                    <span>{o.floorAtOffer} ETH</span>
                    <span style={{ color: parseFloat(pct) < 0 ? '#22c55e' : '#f87171' }}>{pct}%</span>
                    <span style={{ color: STATUS_COLORS[o.status] ?? '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                      {o.status}
                    </span>
                    <span style={{ color: o.isPaperTrade ? '#f59e0b' : '#22c55e', fontSize: 12 }}>
                      {o.isPaperTrade ? 'PAPER' : 'RÉEL'}
                    </span>
                    <span style={styles.muted}>{date}</span>
                    {o.status === 'active' && (
                      <button style={styles.cancelBtn} onClick={() => cancel(o.id)}>Annuler</button>
                    )}
                    {o.status !== 'active' && <span />}
                  </div>
                )
              })}
            </div>
          )}
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid #1e1e3a', background: '#12121f' },
  logo: { fontSize: 20, fontWeight: 700, color: '#7c3aed', textDecoration: 'none' },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: '#94a3b8', textDecoration: 'none', fontSize: 14 },
  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  topBar: { display: 'flex', alignItems: 'center', gap: 16 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  count: { color: '#64748b', fontSize: 14 },
  filters: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  btnGroup: { display: 'flex', gap: 4 },
  filterBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  select: { padding: '6px 10px', borderRadius: 6, border: '1px solid #2d2d4e', background: '#1a1a2e', color: '#e2e8f0', fontSize: 12 },
  muted: { color: '#94a3b8', fontSize: 13 },
  table: { display: 'flex', flexDirection: 'column', gap: 6 },
  thead: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.6fr 0.9fr 0.6fr 1.4fr 0.7fr', padding: '8px 16px', color: '#64748b', fontSize: 12, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.6fr 0.9fr 0.6fr 1.4fr 0.7fr', padding: '11px 16px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2d2d4e', alignItems: 'center', fontSize: 13 },
  cancelBtn: { padding: '4px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }
}
