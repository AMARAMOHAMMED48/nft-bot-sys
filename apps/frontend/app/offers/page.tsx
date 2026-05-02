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

export default function OffersPage() {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await api.getOffers()
      setOffers(data)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  async function cancel(id: string) {
    await api.cancelOffer(id)
    load()
  }

  useEffect(() => { load() }, [])

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
        <h1 style={styles.h1}>Offres actives</h1>
        {loading ? <p style={styles.muted}>Chargement...</p> :
          offers.length === 0 ? <p style={styles.muted}>Aucune offre active</p> : (
            <div style={styles.table}>
              <div style={styles.thead}>
                <span>Collection</span><span>Prix offre</span><span>Floor</span><span>%</span><span>Mode</span><span>Expire</span><span></span>
              </div>

              {offers.map(o => {
                const pct = (((o.offerPrice / o.floorAtOffer) - 1) * 100).toFixed(1)
                const expiry = new Date(o.expiresAt).toLocaleString('fr-FR')
                return (
                  <div key={o.id} style={styles.row}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{o.collectionName ?? o.collection.slice(0, 10) + '...'}</span>
                    <span style={{ color: '#7c3aed' }}>{o.offerPrice} ETH</span>
                    <span>{o.floorAtOffer} ETH</span>
                    <span style={{ color: parseFloat(pct) < 0 ? '#22c55e' : '#f87171' }}>{pct}%</span>
                    <span style={{ color: o.isPaperTrade ? '#f59e0b' : '#22c55e' }}>{o.isPaperTrade ? 'PAPER' : 'RÉEL'}</span>
                    <span style={styles.muted}>{expiry}</span>
                    <button style={styles.cancelBtn} onClick={() => cancel(o.id)}>Annuler</button>
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
  main: { maxWidth: 960, margin: '0 auto', padding: '32px 16px' },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 24 },
  muted: { color: '#94a3b8', fontSize: 14 },
  table: { display: 'flex', flexDirection: 'column', gap: 8 },
  thead: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.7fr 0.7fr 1.5fr 0.8fr', padding: '8px 16px', color: '#94a3b8', fontSize: 13, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.7fr 0.7fr 1.5fr 0.8fr', padding: '12px 16px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2d2d4e', alignItems: 'center', fontSize: 14 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  cancelBtn: { padding: '4px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }
}
