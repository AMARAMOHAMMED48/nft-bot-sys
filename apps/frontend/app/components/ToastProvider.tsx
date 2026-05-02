'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'

type Toast = {
  id: string
  level: 'warn' | 'error'
  module: string
  message: string
  createdAt: string
}

export default function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const sinceRef = useRef(new Date().toISOString())

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    async function poll() {
      try {
        const [warns, errors] = await Promise.all([
          api.getLogs({ level: 'warn', since: sinceRef.current, limit: 5 }),
          api.getLogs({ level: 'error', since: sinceRef.current, limit: 5 })
        ])
        const logs = [...errors, ...warns].sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        const alerts = logs
        if (!alerts.length) return

        sinceRef.current = logs[0].createdAt

        const next: Toast[] = alerts.slice(0, 5).map((l: any) => ({
          id: l.id, level: l.level as 'warn' | 'error',
          module: l.module, message: l.message, createdAt: l.createdAt
        }))

        setToasts(prev => [...next, ...prev].slice(0, 5))
        next.forEach(t => setTimeout(() => dismiss(t.id), t.level === 'error' ? 10000 : 8000))
      } catch {
        // silencieux si pas connecté
      }
    }

    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!toasts.length) return null

  return (
    <div style={styles.container}>
      {toasts.map(t => (
        <div key={t.id} style={{ ...styles.toast, borderLeft: `4px solid ${t.level === 'error' ? '#ef4444' : '#f59e0b'}` }}>
          <div style={styles.header}>
            <span style={{ ...styles.badge, background: t.level === 'error' ? '#450a0a' : '#431407', color: t.level === 'error' ? '#f87171' : '#fb923c' }}>
              {t.level === 'error' ? 'ERROR' : 'WARN'} [{t.module}]
            </span>
            <button style={styles.close} onClick={() => dismiss(t.id)}>✕</button>
          </div>
          <p style={styles.msg}>{t.message.length > 120 ? t.message.slice(0, 120) + '…' : t.message}</p>
          <p style={styles.time}>{new Date(t.createdAt).toLocaleTimeString('fr-FR')}</p>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380
  },
  toast: {
    background: '#1a1a2e', border: '1px solid #2d2d4e', borderRadius: 8,
    padding: '12px 14px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    animation: 'slideIn 0.2s ease'
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' },
  close: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 0 },
  msg: { margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 },
  time: { margin: '6px 0 0', fontSize: 11, color: '#475569' }
}
