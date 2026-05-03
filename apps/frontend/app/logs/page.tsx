'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Log = {
  id: string
  level: 'info' | 'warn' | 'error'
  module: string
  message: string
  createdAt: string
}

const LEVEL: Record<string, { bg: string; text: string }> = {
  error: { bg: '#450a0a', text: 'var(--red)'   },
  warn:  { bg: '#431407', text: 'var(--amber)'  },
  info:  { bg: '#0c1a2e', text: 'var(--blue)'   },
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
    const cur = reset ? 0 : offset
    try {
      const data: Log[] = await api.getLogs({
        level: levelFilter === 'all' ? undefined : levelFilter,
        limit: PAGE_SIZE, offset: cur
      })
      if (reset) { setLogs(data); setOffset(PAGE_SIZE) }
      else        { setLogs(prev => [...prev, ...data]); setOffset(prev => prev + PAGE_SIZE) }
      setHasMore(data.length === PAGE_SIZE)
    } catch { router.push('/login') }
    finally { setLoading(false) }
  }

  useEffect(() => { setLoading(true); load(true) }, [levelFilter])

  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return }
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
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={S.main}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Logs bot</h1>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh 30s
          </label>
        </div>

        <div style={S.filters}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'error', 'warn', 'info'] as const).map(l => (
              <button key={l} className="btn-filter" style={{
                fontFamily: 'monospace',
                background: levelFilter === l ? (l === 'all' ? 'var(--accent)' : LEVEL[l]?.bg ?? 'var(--bg-card)') : 'var(--bg-card)',
                color: levelFilter === l ? (l === 'all' ? '#fff' : LEVEL[l]?.text ?? 'var(--text)') : 'var(--muted)',
                borderColor: levelFilter === l ? 'transparent' : 'var(--border)',
              }} onClick={() => { setLevelFilter(l); setOffset(0) }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <select className="select" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option value="">Tous les modules</option>
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <input className="input" style={{ flex: 1, minWidth: 200 }}
            placeholder="Rechercher dans les messages…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <p style={{ color: 'var(--dim)', fontSize: 12, margin: 0 }}>
          {filtered.length} log{filtered.length !== 1 ? 's' : ''}
          {(moduleFilter || search) && ` (filtré sur ${logs.length} chargés)`}
        </p>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', padding: '20px 0' }}>
            <span className="spinner" />Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Aucun log</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="thead" style={S.cols}>
              <span>Heure</span><span>Niveau</span><span>Module</span><span>Message</span>
            </div>
            {filtered.map(l => (
              <div key={l.id} className="trow fade-in" style={{ ...S.cols, padding: '10px 14px', background: 'var(--bg-card)', borderLeft: `3px solid ${LEVEL[l.level]?.text ?? 'var(--border)'}`, gap: 8 }}>
                <span style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 }}>
                  {new Date(l.createdAt).toLocaleTimeString('fr-FR')}
                  <br />
                  <span style={{ color: 'var(--dim)', fontSize: 11 }}>
                    {new Date(l.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                <span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                    fontFamily: 'monospace',
                    background: LEVEL[l.level]?.bg ?? 'var(--border)',
                    color: LEVEL[l.level]?.text ?? 'var(--text)',
                  }}>
                    {l.level.toUpperCase()}
                  </span>
                </span>
                <span style={{ color: 'var(--accent-light)', fontSize: 12, fontFamily: 'monospace' }}>{l.module}</span>
                <span style={{ color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-word', fontSize: 13 }}>
                  {l.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasMore && !search && !moduleFilter && (
          <button className="btn" style={{ background: 'var(--bg-card)', color: 'var(--muted)', border: '1px solid var(--border)', alignSelf: 'center' }}
            onClick={() => load(false)}>
            Charger plus
          </button>
        )}
      </main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 1140, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  filters: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  cols: { display: 'grid', gridTemplateColumns: '100px 72px 90px 1fr', alignItems: 'start' },
}
