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
  addCollection: (collectionAddress: string, collectionName: string) =>
    apiFetch('/api/collections', { method: 'POST', body: JSON.stringify({ collectionAddress, collectionName }) }),
  toggleCollection: (id: string, enabled: boolean) =>
    apiFetch(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  updateCollectionConfig: (id: string, data: { enabled?: boolean, offerBelowFloorPct?: number, stopLossPct?: number, offerMaxActive?: number }) =>
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
  getOffers: () => apiFetch('/api/offers'),
  cancelOffer: (id: string) => apiFetch(`/api/offers/${id}`, { method: 'DELETE' }),

  // Trades
  getTrades: (limit = 50, status = 'all') =>
    apiFetch(`/api/trades?limit=${limit}&status=${status}`),
  getPnl: () => apiFetch('/api/trades/pnl'),
  getFloors: () => apiFetch('/api/floors'),
  getLogs: (params: { level?: string; since?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.level) q.set('level', params.level)
    if (params.since) q.set('since', params.since)
    if (params.limit) q.set('limit', String(params.limit))
    return apiFetch(`/api/logs?${q}`)
  },
}
