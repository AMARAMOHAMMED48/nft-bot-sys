'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type SnipeConfig = {
  enabled: boolean
  walletAddress: string | null
  paperTrading: boolean
  budgetMaxEth: number
  maxGasGwei: number
  maxPositions: number
  ethReserveGas: number
  discordWebhook: string | null
}

type Collection = {
  id: string
  collectionName: string
  collectionAddress: string
  snipeEnabled: boolean
  buyTriggerPct: number | null
  snipeMaxRank: number | null
}

export default function SnipePage() {
  const router = useRouter()
  const [config, setConfig] = useState<SnipeConfig | null>(null)
  const [wallet, setWallet] = useState<{ address: string | null; hasKey: boolean } | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [privateKey, setPrivateKey] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [cfg, w, cols] = await Promise.all([
        api.getSnipeConfig(), api.getSnipeWallet(), api.getCollections()
      ])
      setConfig(cfg)
      setWallet(w)
      setCollections(cols)
    } catch {
      router.push('/login')
    }
  }

  useEffect(() => { load() }, [])

  async function handleSetWallet(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.setSnipeWallet(privateKey)
      setPrivateKey('')
      setMsg('Wallet snipe ajouté')
      load()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    } finally { setSaving(false) }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    try {
      await api.updateSnipeConfig({
        paperTrading: config.paperTrading,
        budgetMaxEth: config.budgetMaxEth,
        maxGasGwei: config.maxGasGwei,
        maxPositions: config.maxPositions,
        ethReserveGas: config.ethReserveGas,
        discordWebhook: config.discordWebhook
      })
      setMsg('Config sauvegardée')
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    } finally { setSaving(false) }
  }

  async function handleToggle() {
    if (!config) return
    try {
      if (config.enabled) await api.pauseSnipe()
      else await api.startSnipe()
      load()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    }
  }

  function updateConfig(field: string, value: unknown) {
    setConfig(prev => prev ? { ...prev, [field]: value } : prev)
  }

  const activeSnipeCollections = collections.filter(c => c.snipeEnabled)

  if (!config || !wallet) return <div style={styles.loading}>Chargement...</div>

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.logo}>NFT Bot</a>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="/offers" style={styles.navLink}>Offres</a>
          <a href="/trades" style={styles.navLink}>Trades</a>
          <a href="/logs" style={styles.navLink}>Logs</a>
          <a href="/snipe" style={{ ...styles.navLink, color: '#c4b5fd' }}>Snipe</a>
          <a href="/config" style={styles.navLink}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>

        {/* Statut + contrôle */}
        <div style={styles.statusBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...styles.dot, background: config.enabled ? '#22c55e' : '#f87171' }} />
            <span style={{ fontWeight: 700, fontSize: 18 }}>
              Snipe Bot — {config.enabled ? 'Actif' : 'Arrêté'}
            </span>
            <span style={{ color: config.paperTrading ? '#f59e0b' : '#22c55e', fontSize: 13 }}>
              {config.paperTrading ? 'PAPER' : 'RÉEL'}
            </span>
          </div>
          {wallet.hasKey && (
            <button style={{ ...styles.btn, background: config.enabled ? '#f87171' : '#22c55e' }}
              onClick={handleToggle}>
              {config.enabled ? 'Pause' : 'Démarrer'}
            </button>
          )}
        </div>

        {/* Wallet snipe */}
        <Section title="Wallet snipe (dédié — indépendant du bot d'offres)">
          {wallet.hasKey ? (
            <div>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 8px' }}>Adresse :</p>
              <code style={styles.code}>{wallet.address}</code>
              <button style={{ ...styles.btn, background: '#ef4444', marginTop: 12 }}
                onClick={async () => { await api.deleteSnipeWallet(); load() }}>
                Supprimer wallet snipe
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetWallet} style={styles.form}>
              <input style={styles.input} type="password" placeholder="Clé privée snipe (0x...)"
                value={privateKey} onChange={e => setPrivateKey(e.target.value)} required />
              <button style={styles.btn} type="submit" disabled={saving}>
                {saving ? 'Ajout...' : 'Ajouter wallet snipe'}
              </button>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>Chiffrée AES-256 — jamais exposée</p>
            </form>
          )}
        </Section>

        {/* Config globale snipe */}
        <Section title="Configuration snipe">
          <form onSubmit={handleSaveConfig} style={styles.configForm}>
            <div style={styles.configRow}>
              <label style={styles.label}>Mode paper trading</label>
              <button type="button"
                style={{ ...styles.smallBtn, background: config.paperTrading ? '#f59e0b' : '#22c55e' }}
                onClick={() => updateConfig('paperTrading', !config.paperTrading)}>
                {config.paperTrading ? 'PAPER (simulation)' : 'RÉEL'}
              </button>
            </div>
            <Field label="Budget max (ETH)" type="number" step="0.01"
              value={config.budgetMaxEth} onChange={v => updateConfig('budgetMaxEth', parseFloat(v))} />
            <Field label="Gas max (Gwei)" type="number" step="1"
              value={config.maxGasGwei} onChange={v => updateConfig('maxGasGwei', parseInt(v))} />
            <Field label="Max positions ouvertes" type="number" step="1"
              value={config.maxPositions} onChange={v => updateConfig('maxPositions', parseInt(v))} />
            <Field label="Réserve ETH pour gas" type="number" step="0.001"
              value={config.ethReserveGas} onChange={v => updateConfig('ethReserveGas', parseFloat(v))} />
            <Field label="Webhook Discord (optionnel)" type="url"
              value={config.discordWebhook ?? ''} onChange={v => updateConfig('discordWebhook', v || null)} />
            <button style={{ ...styles.btn, marginTop: 4 }} type="submit" disabled={saving}>
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </form>
        </Section>

        {/* Collections avec snipe actif */}
        <Section title="Collections snipe actives">
          {activeSnipeCollections.length === 0 ? (
            <p style={styles.muted}>
              Aucune collection avec snipe activé.
              Activez le snipe dans <a href="/config" style={{ color: '#7c3aed' }}>Config → Collections</a>.
            </p>
          ) : (
            <div style={styles.table}>
              <div style={styles.thead}>
                <span>Collection</span><span>Prix max (×floor)</span><span>Rank max</span>
              </div>
              {activeSnipeCollections.map(c => (
                <div key={c.id} style={styles.row}>
                  <span style={{ fontWeight: 600 }}>{c.collectionName}</span>
                  <span style={{ color: '#7c3aed' }}>
                    {c.buyTriggerPct != null ? `≤ ${(c.buyTriggerPct * 100).toFixed(0)}% floor` : '—'}
                  </span>
                  <span style={{ color: '#60a5fa' }}>
                    {c.snipeMaxRank != null ? `< ${c.snipeMaxRank}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {msg && <p style={styles.msg}>{msg}</p>}
      </main>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', step }: {
  label: string; value: string | number | null | undefined
  onChange: (v: string) => void; type?: string; step?: string
}) {
  const safe = value === null || value === undefined ? '' : value
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: '#94a3b8', fontSize: 13 }}>{label}</label>
      <input style={styles.input} type={type} step={step} value={safe}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' },
  page: { minHeight: '100vh' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px', borderBottom: '1px solid #1e1e3a', background: '#12121f' },
  logo: { fontSize: 20, fontWeight: 700, color: '#7c3aed', textDecoration: 'none' },
  navLinks: { display: 'flex', gap: 24 },
  navLink: { color: '#94a3b8', textDecoration: 'none', fontSize: 14 },
  main: { maxWidth: 700, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24 },
  statusBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1a2e', borderRadius: 10, padding: '20px 24px', border: '1px solid #2d2d4e' },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  section: { background: '#1a1a2e', borderRadius: 10, padding: 24, border: '1px solid #2d2d4e' },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: '#c4b5fd' },
  configForm: { display: 'flex', flexDirection: 'column', gap: 16 },
  configRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#94a3b8', fontSize: 13 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: { padding: '10px 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: 'fit-content' },
  smallBtn: { padding: '6px 12px', borderRadius: 6, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  code: { display: 'block', background: '#0f0f13', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' },
  table: { display: 'flex', flexDirection: 'column', gap: 6 },
  thead: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '6px 12px', color: '#64748b', fontSize: 12, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 12px', background: '#0f0f1a', borderRadius: 6, border: '1px solid #1e1e3a', fontSize: 13 },
  muted: { color: '#94a3b8', fontSize: 14, margin: 0 },
  msg: { color: '#22c55e', fontSize: 14, margin: 0 }
}
