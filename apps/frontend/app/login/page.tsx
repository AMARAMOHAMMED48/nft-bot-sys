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
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>NFT Bot</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Mot de passe" value={password}
            onChange={e => setPassword(e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#1a1a2e', borderRadius: 12, padding: 40, width: 360, border: '1px solid #2d2d4e' },
  title: { textAlign: 'center', marginBottom: 32, fontSize: 28, fontWeight: 700, color: '#7c3aed' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: { padding: '12px 16px', borderRadius: 8, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 15 },
  btn: { padding: '12px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#f87171', fontSize: 14, margin: 0 }
}
