const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),

  // Wallet
  addWallet: (privateKey: string) =>
    apiFetch('/api/wallet', { method: 'POST', body: JSON.stringify({ privateKey }) }),
  getWallet: () => apiFetch('/api/wallet'),
  deleteWallet: () => apiFetch('/api/wallet', { method: 'DELETE' }),

  // Collections
  getCollections: () => apiFetch('/api/collections'),
  addCollection: (collectionAddress: string, collectionName: string, offerBelowFloorPct: number, stopLossPct: number, offerMaxActive: number) =>
    apiFetch('/api/collections', { method: 'POST', body: JSON.stringify({ collectionAddress, collectionName, offerBelowFloorPct, stopLossPct, offerMaxActive }) }),
  toggleCollection: (id: string, enabled: boolean) =>
    apiFetch(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  updateCollectionConfig: (id: string, data: { enabled?: boolean, offerBelowFloorPct?: number, stopLossPct?: number, offerMaxActive?: number, snipeEnabled?: boolean, snipeFloorPct?: number | null, snipeMaxRank?: number | null }) =>
    apiFetch(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCollection: (id: string) =>
    apiFetch(`/api/collections/${id}`, { method: 'DELETE' }),

  // Config
  getConfig: () => apiFetch('/api/config'),
  updateConfig: (data: Record<string, unknown>) =>
    apiFetch('/api/config', { method: 'PUT', body: JSON.stringify(data) }),

  // Bot
  getStatus: () => apiFetch('/api/bot/status'),
  startBot: () => apiFetch('/api/bot/start', { method: 'POST' }),
  pauseBot: () => apiFetch('/api/bot/pause', { method: 'POST' }),
  resumeBot: () => apiFetch('/api/bot/resume', { method: 'POST' }),

  // Offers
  getOffers: (params: { status?: string; isPaperTrade?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.isPaperTrade !== undefined) q.set('isPaperTrade', String(params.isPaperTrade))
    return apiFetch(`/api/offers?${q}`)
  },
  cancelOffer: (id: string) => apiFetch(`/api/offers/${id}`, { method: 'DELETE' }),

  // Trades
  getTrades: (params: { status?: string; isPaperTrade?: boolean; collection?: string } = {}) => {
    const q = new URLSearchParams({ limit: '200' })
    if (params.status) q.set('status', params.status)
    if (params.isPaperTrade !== undefined) q.set('isPaperTrade', String(params.isPaperTrade))
    if (params.collection) q.set('collection', params.collection)
    return apiFetch(`/api/trades?${q}`)
  },
  getPnl: () => apiFetch('/api/trades/pnl'),
  getFloors: () => apiFetch('/api/floors'),
  // Snipe
  getSnipeConfig: () => apiFetch('/api/snipe/config'),
  updateSnipeConfig: (data: Record<string, unknown>) =>
    apiFetch('/api/snipe/config', { method: 'PUT', body: JSON.stringify(data) }),
  getSnipeWallet: () => apiFetch('/api/snipe/wallet'),
  setSnipeWallet: (privateKey: string) =>
    apiFetch('/api/snipe/wallet', { method: 'POST', body: JSON.stringify({ privateKey }) }),
  deleteSnipeWallet: () => apiFetch('/api/snipe/wallet', { method: 'DELETE' }),
  startSnipe: () => apiFetch('/api/snipe/start', { method: 'POST' }),
  pauseSnipe: () => apiFetch('/api/snipe/pause', { method: 'POST' }),

  getLogs: (params: { level?: string; since?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.level) q.set('level', params.level)
    if (params.since) q.set('since', params.since)
    if (params.limit) q.set('limit', String(params.limit))
    if (params.offset) q.set('offset', String(params.offset))
    return apiFetch(`/api/logs?${q}`)
  },
}
