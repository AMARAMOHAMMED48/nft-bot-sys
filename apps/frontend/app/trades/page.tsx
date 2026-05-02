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

export default function TradesPage() {
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [pnl, setPnl] = useState<Pnl | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [t, p] = await Promise.all([api.getTrades(50, 'all'), api.getPnl()])
      setTrades(t)
      setPnl(p)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const statusColor: Record<string, string> = {
    bought: '#f59e0b', listed: '#7c3aed', sold: '#22c55e', timeout_sold: '#94a3b8'
  }

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
            <Card label="P&L Total" value={`${pnl.totalPnl >= 0 ? '+' : ''}${pnl.totalPnl.toFixed(4)} ETH`}
              color={pnl.totalPnl >= 0 ? '#22c55e' : '#f87171'} />
            <Card label="Win Rate" value={`${pnl.winRate}%`} color={pnl.winRate > 60 ? '#22c55e' : '#f87171'} />
            <Card label="Trades vendus" value={`${pnl.soldTrades}`} />
            <Card label="Paper trades" value={`${pnl.paperTrades}`} color="#f59e0b" />
          </div>
        )}

        <h1 style={styles.h1}>Historique des trades</h1>

        {loading ? <p style={styles.muted}>Chargement...</p> :
          trades.length === 0 ? <p style={styles.muted}>Aucun trade</p> : (
            <div style={styles.table}>
              <div style={styles.thead}>
                <span>Token</span><span>Source</span><span>Achat</span><span>Listing</span><span>Vente</span><span>P&L</span><span>Statut</span><span>Mode</span>
              </div>
              {trades.map(t => (
                <div key={t.id} style={styles.row}>
                  <span style={styles.mono}>#{t.tokenId}</span>
                  <span style={styles.muted}>{t.source === 'snipe' ? '🟢 snipe' : '🎯 offre'}</span>
                  <span>{t.buyPrice} ETH</span>
                  <span style={styles.muted}>{t.listPrice ? `${t.listPrice} ETH` : '—'}</span>
                  <span style={styles.muted}>{t.sellPrice ? `${t.sellPrice} ETH` : '—'}</span>
                  <span style={{ color: t.pnl == null ? '#94a3b8' : t.pnl >= 0 ? '#22c55e' : '#f87171' }}>
                    {t.pnl == null ? '—' : `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(4)}`}
                  </span>
                  <span style={{ color: statusColor[t.status] || '#94a3b8' }}>{t.status}</span>
                  <span style={{ color: t.isPaperTrade ? '#f59e0b' : '#22c55e', fontSize: 12 }}>{t.isPaperTrade ? 'PAPER' : 'RÉEL'}</span>
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
  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  card: { background: '#1a1a2e', borderRadius: 10, padding: '20px 24px', border: '1px solid #2d2d4e' },
  cardLabel: { color: '#94a3b8', fontSize: 13, margin: '0 0 8px' },
  cardValue: { fontSize: 22, fontWeight: 700, margin: 0 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  muted: { color: '#94a3b8', fontSize: 14 },
  table: { display: 'flex', flexDirection: 'column', gap: 8 },
  thead: { display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr 1fr 1fr 0.8fr 1fr 0.6fr', padding: '8px 16px', color: '#94a3b8', fontSize: 13, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr 1fr 1fr 0.8fr 1fr 0.6fr', padding: '12px 16px', background: '#1a1a2e', borderRadius: 8, border: '1px solid #2d2d4e', alignItems: 'center', fontSize: 14 },
  mono: { fontFamily: 'monospace', fontSize: 12 }
}
