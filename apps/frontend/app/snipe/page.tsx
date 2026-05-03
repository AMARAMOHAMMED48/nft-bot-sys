'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

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
  snipeFloorPct: number | null
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
      setConfig(cfg); setWallet(w); setCollections(cols)
    } catch { router.push('/login') }
  }

  useEffect(() => { load() }, [])

  async function handleSetWallet(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.setSnipeWallet(privateKey)
      setPrivateKey(''); setMsg('Wallet snipe ajouté'); load()
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
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
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  async function handleToggle() {
    if (!config) return
    try {
      if (config.enabled) await api.pauseSnipe()
      else await api.startSnipe()
      load()
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
  }

  function updateConfig(field: string, value: unknown) {
    setConfig(prev => prev ? { ...prev, [field]: value } : prev)
  }

  const activeSnipeCollections = collections.filter(c => c.snipeEnabled)

  if (!config || !wallet) return (
    <div className="page-loading"><span className="spinner" />Chargement…</div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={S.main}>

        {/* Status bar */}
        <div className="section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`dot${config.enabled ? ' dot-pulse' : ''}`}
              style={{ background: config.enabled ? 'var(--green)' : 'var(--red)', width: 10, height: 10 }} />
            <span style={{ fontWeight: 700, fontSize: 17 }}>
              Snipe Bot — {config.enabled ? 'Actif' : 'Arrêté'}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: config.paperTrading ? '#431407' : '#14532d',
              color: config.paperTrading ? 'var(--amber)' : 'var(--green)'
            }}>
              {config.paperTrading ? 'PAPER' : 'RÉEL'}
            </span>
          </div>
          {wallet.hasKey && (
            <button className="btn"
              style={{ background: config.enabled ? 'var(--red)' : 'var(--green)', color: '#fff' }}
              onClick={handleToggle}>
              {config.enabled ? 'Pause' : 'Démarrer'}
            </button>
          )}
        </div>

        {/* Wallet */}
        <div className="section">
          <h2 className="section-title">Wallet snipe (dédié)</h2>
          {wallet.hasKey ? (
            <div>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px' }}>Adresse</p>
              <code className="code-block">{wallet.address}</code>
              <button className="btn" style={{ background: '#ef4444', color: '#fff', marginTop: 14 }}
                onClick={async () => { await api.deleteSnipeWallet(); load() }}>
                Supprimer wallet snipe
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetWallet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="input" type="password" placeholder="Clé privée (0x…)"
                value={privateKey} onChange={e => setPrivateKey(e.target.value)} required />
              <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }}
                type="submit" disabled={saving}>
                {saving ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />Ajout…</> : 'Ajouter wallet snipe'}
              </button>
              <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>Chiffrée AES-256 — jamais exposée</p>
            </form>
          )}
        </div>

        {/* Config */}
        <div className="section">
          <h2 className="section-title">Configuration snipe</h2>
          <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ color: 'var(--muted)', fontSize: 13 }}>Mode paper trading</label>
              <button type="button" className="btn-sm"
                style={{ background: config.paperTrading ? 'var(--amber)' : 'var(--green)', color: '#fff' }}
                onClick={() => updateConfig('paperTrading', !config.paperTrading)}>
                {config.paperTrading ? 'PAPER (simulation)' : 'RÉEL'}
              </button>
            </div>
            <ConfigField label="Budget max (ETH)" type="number" step="0.01"
              value={config.budgetMaxEth} onChange={v => updateConfig('budgetMaxEth', parseFloat(v))} />
            <ConfigField label="Gas max (Gwei)" type="number" step="1"
              value={config.maxGasGwei} onChange={v => updateConfig('maxGasGwei', parseInt(v))} />
            <ConfigField label="Max positions ouvertes" type="number" step="1"
              value={config.maxPositions} onChange={v => updateConfig('maxPositions', parseInt(v))} />
            <ConfigField label="Réserve ETH pour gas" type="number" step="0.001"
              value={config.ethReserveGas} onChange={v => updateConfig('ethReserveGas', parseFloat(v))} />
            <ConfigField label="Webhook Discord (optionnel)" type="url"
              value={config.discordWebhook ?? ''} onChange={v => updateConfig('discordWebhook', v || null)} />
            <button className="btn" style={{ background: 'var(--accent)', color: '#fff', marginTop: 4 }}
              type="submit" disabled={saving}>
              {saving ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />Sauvegarde…</> : 'Sauvegarder'}
            </button>
          </form>
        </div>

        {/* Collections actives */}
        <div className="section">
          <h2 className="section-title">Collections snipe actives</h2>
          {activeSnipeCollections.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
              Aucune collection avec snipe activé.{' '}
              <a href="/config" style={{ color: 'var(--accent)' }}>Config → Collections</a>
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="thead" style={S.cols}>
                <span>Collection</span><span>Prix max</span><span>Rank max</span>
              </div>
              {activeSnipeCollections.map(c => (
                <div key={c.id} className="trow" style={{ ...S.cols, padding: '11px 14px', background: 'var(--bg-deep)' }}>
                  <span style={{ fontWeight: 600 }}>{c.collectionName}</span>
                  <span style={{ color: 'var(--accent)' }}>
                    {c.snipeFloorPct != null ? `floor${c.snipeFloorPct >= 0 ? '+' : ''}${c.snipeFloorPct}%` : '—'}
                  </span>
                  <span style={{ color: 'var(--blue)' }}>
                    {c.snipeMaxRank != null ? `≤ ${c.snipeMaxRank}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {msg && <p style={{ color: 'var(--green)', fontSize: 14, margin: 0 }}>{msg}</p>}
      </main>
    </div>
  )
}

function ConfigField({ label, value, onChange, type = 'text', step }: {
  label: string; value: string | number | null | undefined
  onChange: (v: string) => void; type?: string; step?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
      <label style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</label>
      <input className="input" type={type} step={step}
        value={value === null || value === undefined ? '' : value}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  main: { maxWidth: 720, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 20 },
  cols: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'center' },
}
