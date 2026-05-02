'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'

type Collection = {
  id: string
  collectionAddress: string
  collectionName: string
  enabled: boolean
  offerBelowFloorPct: number
  stopLossPct: number
  offerMaxActive: number
}

type Config = {
  paperTrading: boolean
  budgetMaxEth: number
  maxGasGwei: number
  offerExpiryMin: number
  relistAfterMin: number
  timeoutSellH: number
  discordWebhook: string | null
  autoWrapAfterSale: boolean
  ethReserveGas: number
}

export default function ConfigPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<Collection[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [newAddr, setNewAddr] = useState('')
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [cols, cfg] = await Promise.all([api.getCollections(), api.getConfig()])
      setCollections(cols)
      setConfig(cfg)
    } catch {
      router.push('/login')
    }
  }

  useEffect(() => { load() }, [])

  async function addCollection(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.addCollection(newAddr.trim(), newName.trim())
      setNewAddr('')
      setNewName('')
      setMsg('Collection ajoutée')
      load()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function toggleCollection(id: string, enabled: boolean) {
    await api.toggleCollection(id, !enabled)
    load()
  }

  async function deleteCollection(id: string) {
    await api.deleteCollection(id)
    load()
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    try {
      await api.updateConfig(config)
      setMsg('Config sauvegardée')
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  function updateConfig(field: string, value: unknown) {
    setConfig(prev => prev ? { ...prev, [field]: value } : prev)
  }

  if (!config) return <div style={styles.loading}>Chargement...</div>

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.logo}>NFT Bot</a>
        <div style={styles.navLinks}>
          <a href="/dashboard" style={styles.navLink}>Dashboard</a>
          <a href="/offers" style={styles.navLink}>Offres</a>
          <a href="/trades" style={styles.navLink}>Trades</a>
          <a href="/config" style={{ ...styles.navLink, color: '#c4b5fd' }}>Config</a>
        </div>
      </nav>

      <main style={styles.main}>

        {/* Collections */}
        <Section title="Collections surveillées">
          <form onSubmit={addCollection} style={styles.row}>
            <input style={{ ...styles.input, flex: 2 }} placeholder="Adresse contrat (0x...)"
              value={newAddr} onChange={e => setNewAddr(e.target.value)} required />
            <input style={{ ...styles.input, flex: 1 }} placeholder="Nom (ex: BAYC)"
              value={newName} onChange={e => setNewName(e.target.value)} required />
            <button style={styles.btn} type="submit">Ajouter</button>
          </form>

          {collections.length === 0
            ? <p style={styles.muted}>Aucune collection ajoutée</p>
            : collections.map(c => (
              <CollectionRow key={c.id} col={c}
                onToggle={() => toggleCollection(c.id, c.enabled)}
                onDelete={() => deleteCollection(c.id)}
                onSave={(data) => api.updateCollectionConfig(c.id, data).then(load)}
              />
            ))
          }
        </Section>

        {/* Bot config */}
        <Section title="Paramètres du bot">
          <form onSubmit={saveConfig} style={styles.configForm}>

            <div style={styles.configRow}>
              <label style={styles.label}>Mode paper trading</label>
              <button type="button"
                style={{ ...styles.smallBtn, background: config.paperTrading ? '#f59e0b' : '#22c55e' }}
                onClick={() => updateConfig('paperTrading', !config.paperTrading)}>
                {config.paperTrading ? 'PAPER (simulation)' : 'RÉEL'}
              </button>
            </div>

            <Field label="Durée offre (minutes, ex: 15 / 60 / 1440)" type="number" step="1"
              value={config.offerExpiryMin} onChange={v => updateConfig('offerExpiryMin', parseInt(v))} />
            <Field label="Durée listing & auto-relist (minutes, ex: 15 / 60 / 1440)" type="number" step="1"
              value={config.relistAfterMin} onChange={v => updateConfig('relistAfterMin', parseInt(v))} />
            <Field label="Budget max (ETH)" type="number" step="0.01"
              value={config.budgetMaxEth} onChange={v => updateConfig('budgetMaxEth', parseFloat(v))} />
            <Field label="Gas max (Gwei)" type="number" step="1"
              value={config.maxGasGwei} onChange={v => updateConfig('maxGasGwei', parseInt(v))} />
            <Field label="Timeout listing (heures)" type="number" step="1"
              value={config.timeoutSellH} onChange={v => updateConfig('timeoutSellH', parseInt(v))} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e2e8f0', fontSize: 14 }}>
              <input type="checkbox" checked={(config as any).autoWrapAfterSale ?? true}
                onChange={e => updateConfig('autoWrapAfterSale', e.target.checked)} />
              Auto-swap ETH → WETH après vente
            </label>
            <Field label="Réserve ETH pour gas (ex: 0.01)" type="number" step="0.001"
              value={(config as any).ethReserveGas ?? 0.01} onChange={v => updateConfig('ethReserveGas', parseFloat(v))} />

            <Field label="Webhook Discord" type="url"
              value={config.discordWebhook ?? ''} onChange={v => updateConfig('discordWebhook', v || null)} />

            <button style={{ ...styles.btn, marginTop: 8 }} type="submit" disabled={saving}>
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </form>
        </Section>

        {msg && <p style={styles.msg}>{msg}</p>}
      </main>
    </div>
  )
}

function CollectionRow({ col, onToggle, onDelete, onSave }: {
  col: Collection
  onToggle: () => void
  onDelete: () => void
  onSave: (data: { offerBelowFloorPct?: number, stopLossPct?: number, offerMaxActive?: number }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [belowPct, setBelowPct] = useState(col.offerBelowFloorPct.toString())
  const [slPct, setSlPct] = useState(col.stopLossPct.toString())
  const [maxActive, setMaxActive] = useState(col.offerMaxActive.toString())

  return (
    <div style={{ borderBottom: '1px solid #2d2d4e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
            {expanded ? '▾' : '▸'} {col.collectionName}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{col.collectionAddress}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7c3aed' }}>
            {`Offre: -${col.offerBelowFloorPct}% · SL: -${col.stopLossPct}% · Max offres: ${col.offerMaxActive}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...styles.smallBtn, background: col.enabled ? '#22c55e' : '#4b5563' }} onClick={onToggle}>
            {col.enabled ? 'Active' : 'Inactive'}
          </button>
          <button style={{ ...styles.smallBtn, background: '#ef4444' }} onClick={onDelete}>Supprimer</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Sous le floor (%)
              </label>
              <input style={styles.input} type="number" step="0.1" required
                value={belowPct} onChange={e => setBelowPct(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Stop-loss (%)
              </label>
              <input style={styles.input} type="number" step="0.1" required
                value={slPct} onChange={e => setSlPct(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Max offres actives
              </label>
              <input style={styles.input} type="number" step="1" min="1" required
                value={maxActive} onChange={e => setMaxActive(e.target.value)} />
            </div>
            <button style={styles.smallBtn} onClick={() => {
              onSave({
                offerBelowFloorPct: parseFloat(belowPct),
                stopLossPct: parseFloat(slPct),
                offerMaxActive: parseInt(maxActive)
              })
              setExpanded(false)
            }}>
              Sauver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', step }: {
  label: string
  value: string | number | null | undefined
  onChange: (v: string) => void
  type?: string
  step?: string
}) {
  const safeValue = value === null || value === undefined || (typeof value === 'number' && isNaN(value)) ? '' : value
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: '#94a3b8', fontSize: 13 }}>{label}</label>
      <input style={styles.input} type={type} step={step} value={safeValue}
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
  section: { background: '#1a1a2e', borderRadius: 10, padding: 24, border: '1px solid #2d2d4e' },
  sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: '#c4b5fd' },
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  collectionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #2d2d4e' },
  configForm: { display: 'flex', flexDirection: 'column', gap: 16 },
  configRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#94a3b8', fontSize: 13 },
  input: { padding: '10px 14px', borderRadius: 8, border: '1px solid #2d2d4e', background: '#0f0f13', color: '#e2e8f0', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  btn: { padding: '10px 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  smallBtn: { padding: '6px 12px', borderRadius: 6, color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  muted: { color: '#94a3b8', fontSize: 14, margin: '12px 0 0' },
  msg: { color: '#22c55e', fontSize: 14, margin: 0 }
}
