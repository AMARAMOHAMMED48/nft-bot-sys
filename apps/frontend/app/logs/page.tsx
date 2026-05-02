'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type Log = {
  id: string
  level: 'info' | 'warn' | 'error'
  module: string
  message: string
  createdAt: string
}

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  error: { bg: '#450a0a', text: '#f87171' },
  warn:  { bg: '#431407', text: '#fb923c' },
  info:  { bg: '#0c1a2e', text: '#60a5fa' },
}

const PAGE_SIZE = 50

export default function LogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all')
  const [moduleFilter, setModuleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load(reset = false) {
    const currentOffset = reset ? 0 : offset
    try {
      const data: Log[] = await api.getLogs({
        level: levelFilter === 'all' ? undefined : levelFilter,
        limit: PAGE_SIZE,
        offset: currentOffset
      })
      if (reset) {
        setLogs(data)
        setOffset(PAGE_SIZE)
      } else {
        setLogs(prev => [...prev, ...data])
        setOffset(prev => prev + PAGE_SIZE)
      }
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load(true)
  }, [levelFilter])

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => load(true), 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, levelFilter])

  const modules = Array.from(new Set(logs.map(l => l.module))).sort()

  const filtered = logs.filter(l => {
    if (moduleFilter && l.module !== moduleFilter) return false
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.logo}>NFT Bot</a>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="/offers" style={styles.navLink}>Offres</a>
          <a href="/trades" style={styles.navLink}>Trades</a>
          <a href="/logs" style={{ ...styles.navLink, color: '#c4b5fd' }}>Logs</a>
          <a href="/config" style={styles.navLink}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <h1 style={styles.h1}>Logs bot</h1>
          <label style={styles.toggleLabel}>
            <input type="checkbox" checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh 30s
          </label>
        </div>

        {/* Filtres */}
        <div style={styles.filters}>
          <div style={styles.levelBtns}>
            {(['all', 'error', 'warn', 'info'] as const).map(l => (
              <button key={l} style={{
                ...styles.levelBtn,
                background: levelFilter === l ? (l === 'all' ? '#7c3aed' : LEVEL_COLORS[l]?.bg ?? '#2d2d4e') : '#1a1a2e',
                color: levelFilter === l ? (l === 'all' ? '#fff' : LEVEL_COLORS[l]?.text ?? '#e2e8f0') : '#94a3b8',
                borderColor: levelFilter === l ? 'transparent' : '#2d2d4e',
              }} onClick={() => { setLevelFilter(l); setOffset(0) }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <select style={styles.select} value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}>
            <option value="">Tous les modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <input style={styles.searchInput} placeholder="Rechercher dans les messages..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Compteur */}
        <p style={styles.count}>
          {filtered.length} log{filtered.length !== 1 ? 's' : ''}
          {(moduleFilter || search) && ` (filtré sur ${logs.length} chargés)`}
        </p>

        {/* Table */}
        {loading ? (
          <p style={styles.muted}>Chargement...</p>
        ) : filtered.length === 0 ? (
          <p style={styles.muted}>Aucun log</p>
        ) : (
          <div style={styles.table}>
            <div style={styles.thead}>
              <span>Heure</span>
              <span>Niveau</span>
              <span>Module</span>
              <span>Message</span>
            </div>
            {filtered.map(l => (
              <div key={l.id} style={{
                ...styles.row,
                borderLeft: `3px solid ${LEVEL_COLORS[l.level]?.text ?? '#2d2d4e'}`
              }}>
                <span style={styles.time}>
                  {new Date(l.createdAt).toLocaleTimeString('fr-FR')}
                  <br />
                  <span style={styles.date}>{new Date(l.createdAt).toLocaleDateString('fr-FR')}</span>
                </span>
                <span>
                  <span style={{
                    ...styles.badge,
                    background: LEVEL_COLORS[l.level]?.bg ?? '#2d2d4e',
                    color: LEVEL_COLORS[l.level]?.text ?? '#e2e8f0'
                  }}>
                    {l.level.toUpperCase()}
                  </span>
                </span>
                <span style={styles.module}>{l.module}</span>
                <span style={styles.message}>{l.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !search && !moduleFilter && (
          <button style={styles.loadMore} onClick={() => load(false)}>
            Charger plus
          </button>
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
  main: { maxWidth: 1100, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 16 },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' },
  filters: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  levelBtns: { display: 'flex', gap: 6 },
  levelBtn: { padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace' },
  select: { padding: '7px 12px', borderRadius: 6, border: '1px solid #2d2d4e', background: '#1a1a2e', color: '#e2e8f0', fontSize: 13 },
  searchInput: { flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 6, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 13 },
  count: { color: '#64748b', fontSize: 13, margin: 0 },
  table: { display: 'flex', flexDirection: 'column', gap: 4 },
  thead: { display: 'grid', gridTemplateColumns: '100px 70px 80px 1fr', padding: '6px 14px', color: '#64748b', fontSize: 12, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '100px 70px 80px 1fr', padding: '10px 14px', background: '#1a1a2e', borderRadius: 6, alignItems: 'start', fontSize: 13, gap: 8 },
  time: { color: '#94a3b8', fontSize: 12, lineHeight: 1.4 },
  date: { color: '#475569', fontSize: 11 },
  badge: { fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace' },
  module: { color: '#7c3aed', fontSize: 12, fontFamily: 'monospace' },
  message: { color: '#cbd5e1', lineHeight: 1.5, wordBreak: 'break-word' },
  muted: { color: '#94a3b8', fontSize: 14 },
  loadMore: { padding: '10px 24px', borderRadius: 8, background: '#1a1a2e', border: '1px solid #2d2d4e', color: '#94a3b8', fontSize: 14, cursor: 'pointer', alignSelf: 'center' }
}
