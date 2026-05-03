'use client'
import { useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="fade-in" style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '40px 36px', width: '100%', maxWidth: 380, border: '1px solid var(--border)' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 32, fontSize: 26, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.3px' }}>
          NFT Bot
        </h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input className="input" type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required autoFocus />
          <input className="input" type="password" placeholder="Mot de passe" value={password}
            onChange={e => setPassword(e.target.value)} required />
          {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{error}</p>}
          <button className="btn" style={{ background: 'var(--accent)', color: '#fff', marginTop: 4 }}
            type="submit" disabled={loading}>
            {loading ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />Connexion...</> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
