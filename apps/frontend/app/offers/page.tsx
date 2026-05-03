'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

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

const STATUS_COLOR: Record<string, string> = {
  active:    'var(--green)',
  expired:   'var(--muted)',
  cancelled: 'var(--red)',
  accepted:  'var(--accent)',
}

const STATUS_LABEL: Record<string, string> = {
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
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  useEffect(() => { load(statusFilter) }, [statusFilter])

  async function cancel(id: string) {
    await api.cancelOffer(id)
    load(statusFilter)
  }

  const collections = Array.from(new Set(offers.map(o => o.collection))).sort()

  const filtered = offers.filter(o => {
    if (modeFilter === 'paper' && !o.isPaperTrade) return false
    if (modeFilter === 'real' && o.isPaperTrade) return false
    if (colFilter && o.collection.toLowerCase() !== colFilter.toLowerCase()) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={S.main}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Offres</h1>
          <span style={{ color: 'var(--dim)', fontSize: 13 }}>{filtered.length} / {offers.length}</span>
        </div>

        <div style={S.filters}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(STATUS_LABEL).map(([val, label]) => (
              <button key={val} className="btn-filter" style={{
                background: statusFilter === val ? (STATUS_COLOR[val] ? `${STATUS_COLOR[val]}22` : 'var(--accent-dim)') : 'var(--bg-card)',
                color: statusFilter === val ? (STATUS_COLOR[val] ?? 'var(--accent-light)') : 'var(--muted)',
                borderColor: statusFilter === val ? (STATUS_COLOR[val] ?? 'var(--accent)') : 'var(--border)',
              }} onClick={() => setStatusFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'Tous'], ['paper', 'Paper'], ['real', 'Réel']] as const).map(([val, label]) => (
              <button key={val} className="btn-filter" style={{
                background: modeFilter === val ? (val === 'paper' ? '#92400e' : val === 'real' ? '#14532d' : 'var(--accent)') : 'var(--bg-card)',
                color: modeFilter === val ? '#fff' : 'var(--muted)',
                borderColor: modeFilter === val ? 'transparent' : 'var(--border)',
              }} onClick={() => setModeFilter(val)}>
                {label}
              </button>
            ))}
          </div>

          <select className="select" value={colFilter} onChange={e => setColFilter(e.target.value)}>
            <option value="">Toutes collections</option>
            {collections.map(c => {
              const name = offers.find(o => o.collection === c)?.collectionName
              return <option key={c} value={c}>{name ?? `${c.slice(0, 8)}…${c.slice(-4)}`}</option>
            })}
          </select>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', padding: '20px 0' }}>
            <span className="spinner" />Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Aucune offre</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="thead" style={S.cols}>
              <span>Collection</span><span>Prix offre</span><span>Floor</span>
              <span>%</span><span>Statut</span><span>Mode</span><span>Date</span><span />
            </div>
            {filtered.map(o => {
              const pct = (((o.offerPrice / o.floorAtOffer) - 1) * 100).toFixed(1)
              const date = statusFilter === 'active'
                ? new Date(o.expiresAt).toLocaleString('fr-FR')
                : new Date(o.createdAt).toLocaleDateString('fr-FR')
              return (
                <div key={o.id} className="trow" style={{ ...S.cols, padding: '12px 14px', background: 'var(--bg-card)', borderLeft: `3px solid ${STATUS_COLOR[o.status] ?? 'var(--border)'}` }}>
                  <span style={{ fontWeight: 600 }}>
                    {o.collectionName ?? `${o.collection.slice(0, 8)}…`}
                  </span>
                  <span style={{ color: 'var(--accent)' }}>{o.offerPrice} ETH</span>
                  <span style={{ color: 'var(--muted)' }}>{o.floorAtOffer} ETH</span>
                  <span style={{ color: parseFloat(pct) < 0 ? 'var(--green)' : 'var(--red)' }}>{pct}%</span>
                  <span style={{ color: STATUS_COLOR[o.status] ?? 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                    {o.status}
                  </span>
                  <span style={{ color: o.isPaperTrade ? 'var(--amber)' : 'var(--green)', fontSize: 12 }}>
                    {o.isPaperTrade ? 'PAPER' : 'RÉEL'}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{date}</span>
                  {o.status === 'active'
                    ? <button className="btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={() => cancel(o.id)}>Annuler</button>
                    : <span />
                  }
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1140, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 18 },
  filters: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  cols: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.6fr 0.9fr 0.6fr 1.3fr 0.8fr', alignItems: 'center' },
}
