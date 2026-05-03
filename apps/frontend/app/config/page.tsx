'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'

type Collection = {
  id: string
  collectionAddress: string
  collectionName: string
  enabled: boolean
  offerBelowFloorPct: number
  stopLossPct: number
  offerMaxActive: number
  snipeEnabled: boolean
  snipeFloorPct: number | null
  snipeMaxRank: number | null
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
  const [newBelowPct, setNewBelowPct] = useState('5')
  const [newSlPct, setNewSlPct] = useState('10')
  const [newMaxActive, setNewMaxActive] = useState('5')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [cols, cfg] = await Promise.all([api.getCollections(), api.getConfig()])
      setCollections(cols); setConfig(cfg)
    } catch { router.push('/login') }
  }

  useEffect(() => { load() }, [])

  async function addCollection(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.addCollection(newAddr.trim(), newName.trim(), parseFloat(newBelowPct), parseFloat(newSlPct), parseInt(newMaxActive))
      setNewAddr(''); setNewName(''); setNewBelowPct('5'); setNewSlPct('10'); setNewMaxActive('5')
      setMsg('Collection ajoutée'); load()
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    try {
      await api.updateConfig(config); setMsg('Config sauvegardée')
    } catch (err: unknown) { setMsg(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  function updateConfig(field: string, value: unknown) {
    setConfig(prev => prev ? { ...prev, [field]: value } : prev)
  }

  if (!config) return (
    <div className="page-loading"><span className="spinner" />Chargement…</div>
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Collections */}
        <div className="section">
          <h2 className="section-title">Collections surveillées</h2>

          {/* Formulaire ajout */}
          <form onSubmit={addCollection} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 2 }} placeholder="Adresse contrat (0x…)"
                value={newAddr} onChange={e => setNewAddr(e.target.value)} required />
              <input className="input" style={{ flex: 1 }} placeholder="Nom (ex: BAYC)"
                value={newName} onChange={e => setNewName(e.target.value)} required />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <FormField label="Sous le floor (%)">
                <input className="input" type="number" step="0.1" min="0" required
                  value={newBelowPct} onChange={e => setNewBelowPct(e.target.value)} />
              </FormField>
              <FormField label="Stop-loss (%)">
                <input className="input" type="number" step="0.1" min="0" required
                  value={newSlPct} onChange={e => setNewSlPct(e.target.value)} />
              </FormField>
              <FormField label="Max offres actives">
                <input className="input" type="number" step="1" min="1" required
                  value={newMaxActive} onChange={e => setNewMaxActive(e.target.value)} />
              </FormField>
              <button className="btn" style={{ background: 'var(--accent)', color: '#fff', alignSelf: 'flex-end' }}
                type="submit">
                Ajouter
              </button>
            </div>
          </form>

          {collections.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Aucune collection ajoutée</p>
            : collections.map(c => (
              <CollectionRow key={c.id} col={c}
                onToggle={() => api.toggleCollection(c.id, !c.enabled).then(load)}
                onDelete={() => api.deleteCollection(c.id).then(load)}
                onSave={data => api.updateCollectionConfig(c.id, data).then(load)}
              />
            ))
          }
        </div>

        {/* Bot config */}
        <div className="section">
          <h2 className="section-title">Paramètres du bot</h2>
          <form onSubmit={saveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
              <label style={{ color: 'var(--muted)', fontSize: 13 }}>Mode paper trading</label>
              <button type="button" className="btn-sm"
                style={{ background: config.paperTrading ? 'var(--amber)' : 'var(--green)', color: '#fff' }}
                onClick={() => updateConfig('paperTrading', !config.paperTrading)}>
                {config.paperTrading ? 'PAPER (simulation)' : 'RÉEL'}
              </button>
            </div>

            <div style={S.grid2}>
              <ConfigField label="Durée offre (min)" type="number" step="1"
                value={config.offerExpiryMin} onChange={v => updateConfig('offerExpiryMin', parseInt(v))} />
              <ConfigField label="Durée listing / relist (min)" type="number" step="1"
                value={config.relistAfterMin} onChange={v => updateConfig('relistAfterMin', parseInt(v))} />
              <ConfigField label="Budget max (ETH)" type="number" step="0.01"
                value={config.budgetMaxEth} onChange={v => updateConfig('budgetMaxEth', parseFloat(v))} />
              <ConfigField label="Gas max (Gwei)" type="number" step="1"
                value={config.maxGasGwei} onChange={v => updateConfig('maxGasGwei', parseInt(v))} />
              <ConfigField label="Timeout listing (heures)" type="number" step="1"
                value={config.timeoutSellH} onChange={v => updateConfig('timeoutSellH', parseInt(v))} />
              <ConfigField label="Réserve ETH gas" type="number" step="0.001"
                value={(config as any).ethReserveGas ?? 0.01} onChange={v => updateConfig('ethReserveGas', parseFloat(v))} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 14 }}>
              <input type="checkbox" checked={(config as any).autoWrapAfterSale ?? true}
                onChange={e => updateConfig('autoWrapAfterSale', e.target.checked)} />
              Auto-swap ETH → WETH après vente
            </label>

            <ConfigField label="Webhook Discord" type="url"
              value={config.discordWebhook ?? ''} onChange={v => updateConfig('discordWebhook', v || null)} />

            <button className="btn" style={{ background: 'var(--accent)', color: '#fff', marginTop: 4 }}
              type="submit" disabled={saving}>
              {saving ? <><span className="spinner" style={{ borderTopColor: '#fff' }} />Sauvegarde…</> : 'Sauvegarder'}
            </button>
          </form>
        </div>

        {msg && <p style={{ color: 'var(--green)', fontSize: 14, margin: 0 }}>{msg}</p>}
      </main>
    </div>
  )
}

function CollectionRow({ col, onToggle, onDelete, onSave }: {
  col: Collection
  onToggle: () => void
  onDelete: () => void
  onSave: (data: { offerBelowFloorPct?: number; stopLossPct?: number; offerMaxActive?: number; snipeEnabled?: boolean; snipeFloorPct?: number | null; snipeMaxRank?: number | null }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [belowPct, setBelowPct] = useState(col.offerBelowFloorPct.toString())
  const [slPct, setSlPct] = useState(col.stopLossPct.toString())
  const [maxActive, setMaxActive] = useState(col.offerMaxActive.toString())
  const [snipeEnabled, setSnipeEnabled] = useState(col.snipeEnabled)
  const [snipeFloorPct, setSnipeFloorPct] = useState(col.snipeFloorPct?.toString() ?? '')
  const [snipeMaxRank, setSnipeMaxRank] = useState(col.snipeMaxRank?.toString() ?? '')

  return (
    <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0' }}>
        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setExpanded(!expanded)}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--dim)', fontSize: 12 }}>{expanded ? '▾' : '▸'}</span>
            {col.collectionName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--dim)', fontFamily: 'monospace' }}>
            {col.collectionAddress}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--accent-light)' }}>
            {`Offre: -${col.offerBelowFloorPct}% · SL: -${col.stopLossPct}% · Max: ${col.offerMaxActive}`}
            {col.snipeEnabled && (
              <span style={{ color: 'var(--blue)', marginLeft: 6 }}>
                {`· Snipe${col.snipeFloorPct != null ? ` ≤floor${col.snipeFloorPct >= 0 ? '+' : ''}${col.snipeFloorPct}%` : ''}${col.snipeMaxRank != null ? ` rank≤${col.snipeMaxRank}` : ''}`}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn-sm"
            style={{ background: col.enabled ? 'var(--green)' : 'var(--dim)', color: '#fff' }}
            onClick={onToggle}>
            {col.enabled ? 'Active' : 'Inactive'}
          </button>
          <button className="btn-sm" style={{ background: '#ef4444', color: '#fff' }} onClick={onDelete}>
            Supprimer
          </button>
        </div>
      </div>

      {expanded && (
        <div className="fade-in" style={{ padding: '12px 0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Offres */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <FormField label="Sous le floor (%)">
              <input className="input" type="number" step="0.1" required
                value={belowPct} onChange={e => setBelowPct(e.target.value)} />
            </FormField>
            <FormField label="Stop-loss (%)">
              <input className="input" type="number" step="0.1" required
                value={slPct} onChange={e => setSlPct(e.target.value)} />
            </FormField>
            <FormField label="Max offres actives">
              <input className="input" type="number" step="1" min="1" required
                value={maxActive} onChange={e => setMaxActive(e.target.value)} />
            </FormField>
          </div>

          {/* Snipe */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--accent-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Snipe
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13, cursor: 'pointer', paddingBottom: 10 }}>
                <input type="checkbox" checked={snipeEnabled} onChange={e => setSnipeEnabled(e.target.checked)} />
                Snipe activé
              </label>
              <FormField label="% au-dessus floor (0 = floor, 5 = +5%)">
                <input className="input" type="number" step="1" placeholder="ex: 0 ou 5"
                  value={snipeFloorPct} onChange={e => setSnipeFloorPct(e.target.value)} />
              </FormField>
              <FormField label="Rank max (inclus) ex: 500">
                <input className="input" type="number" step="1" min="1" placeholder="ex: 500"
                  value={snipeMaxRank} onChange={e => setSnipeMaxRank(e.target.value)} />
              </FormField>
            </div>
          </div>

          <button className="btn" style={{ background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start' }}
            onClick={() => {
              onSave({
                offerBelowFloorPct: parseFloat(belowPct),
                stopLossPct: parseFloat(slPct),
                offerMaxActive: parseInt(maxActive),
                snipeEnabled,
                snipeFloorPct: snipeFloorPct !== '' ? parseFloat(snipeFloorPct) : null,
                snipeMaxRank: snipeMaxRank ? parseInt(snipeMaxRank) : null,
              })
              setExpanded(false)
            }}>
            Sauvegarder
          </button>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
      <label style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</label>
      {children}
    </div>
  )
}

function ConfigField({ label, value, onChange, type = 'text', step }: {
  label: string; value: string | number | null | undefined
  onChange: (v: string) => void; type?: string; step?: string
}) {
  const safe = value === null || value === undefined || (typeof value === 'number' && isNaN(value)) ? '' : value
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</label>
      <input className="input" type={type} step={step} value={safe}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
}
