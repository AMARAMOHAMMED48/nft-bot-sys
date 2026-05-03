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
        if (!logs.length) return
        sinceRef.current = logs[0].createdAt
        const next: Toast[] = logs.slice(0, 5).map((l: any) => ({
          id: l.id, level: l.level as 'warn' | 'error',
          module: l.module, message: l.message, createdAt: l.createdAt
        }))
        setToasts(prev => [...next, ...prev].slice(0, 5))
        next.forEach(t => setTimeout(() => dismiss(t.id), t.level === 'error' ? 10000 : 8000))
      } catch { /* silencieux si pas connecté */ }
    }

    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (!toasts.length) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-in" style={{
          background: 'var(--bg-card)', borderRadius: 8, padding: '12px 14px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)', border: '1px solid var(--border)',
          borderLeft: `4px solid ${t.level === 'error' ? 'var(--red)' : 'var(--amber)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace',
              background: t.level === 'error' ? '#450a0a' : '#431407',
              color: t.level === 'error' ? 'var(--red)' : 'var(--amber)'
            }}>
              {t.level === 'error' ? 'ERROR' : 'WARN'} [{t.module}]
            </span>
            <button style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14, padding: 0 }}
              onClick={() => dismiss(t.id)}>✕</button>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
            {t.message.length > 120 ? t.message.slice(0, 120) + '…' : t.message}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--dim)' }}>
            {new Date(t.createdAt).toLocaleTimeString('fr-FR')}
          </p>
        </div>
      ))}
    </div>
  )
}
