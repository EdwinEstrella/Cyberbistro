import type { SyncOutboxEntry } from './localFirst'

export interface LanEdgeEventEnvelope {
  event_id: string
  tenant_id: string
  replicate_to_cloud: boolean
  entry: SyncOutboxEntry
}

export interface PulledLanEdgeEvent extends LanEdgeEventEnvelope {
  seq: number
  received_at: string
}

export interface LanEdgePullResult {
  events: PulledLanEdgeEvent[]
  nextCursor: number
  hasMore: boolean
}

const EDGE_URL_STORAGE_KEY = 'cloudix_lan_edge_url'
const EDGE_CURSOR_STORAGE_PREFIX = 'cloudix_lan_edge_cursor:'
const EDGE_DEFAULT_PORT = '47821'
const REQUEST_TIMEOUT_MS = 2_500

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getLanEdgeBaseUrl(): string | null {
  if (typeof window === 'undefined') return null

  const configured = localStorage.getItem(EDGE_URL_STORAGE_KEY)
  if (configured?.trim()) return normalizedBaseUrl(configured)

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.port === EDGE_DEFAULT_PORT) return window.location.origin
  }

  if (Boolean((window as Window & { electronAPI?: unknown }).electronAPI)) {
    return `http://127.0.0.1:${EDGE_DEFAULT_PORT}`
  }

  return null
}

export function setLanEdgeBaseUrl(url: string | null): void {
  if (typeof window === 'undefined') return
  if (!url?.trim()) localStorage.removeItem(EDGE_URL_STORAGE_KEY)
  else localStorage.setItem(EDGE_URL_STORAGE_KEY, normalizedBaseUrl(url))
}

function readCursor(tenantId: string): number {
  if (typeof window === 'undefined') return 0
  const value = Number(localStorage.getItem(`${EDGE_CURSOR_STORAGE_PREFIX}${tenantId}`) || 0)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function commitLanEdgeCursor(tenantId: string, cursor: number): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(cursor) || cursor < 0) return
  localStorage.setItem(`${EDGE_CURSOR_STORAGE_PREFIX}${tenantId}`, String(Math.floor(cursor)))
}

async function edgeFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = getLanEdgeBaseUrl()
  if (!baseUrl) throw new Error('Cloudix LAN Edge no está configurado en este dispositivo.')

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function isLanEdgeAvailable(): Promise<boolean> {
  try {
    const response = await edgeFetch('/v1/health')
    return response.ok
  } catch {
    return false
  }
}

export async function publishLanOutboxEntry(
  entry: SyncOutboxEntry,
  replicateToCloud = true,
): Promise<void> {
  const envelope: LanEdgeEventEnvelope = {
    event_id: entry.id,
    tenant_id: entry.tenant_id,
    replicate_to_cloud: replicateToCloud,
    entry,
  }
  const response = await edgeFetch('/v1/events', {
    method: 'POST',
    body: JSON.stringify({ events: [envelope] }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `Cloudix LAN Edge respondió ${response.status}.`)
  }
}

export async function publishLanSnapshotEntries(entries: SyncOutboxEntry[]): Promise<void> {
  if (entries.length === 0) return
  const events: LanEdgeEventEnvelope[] = entries.map((entry) => ({
    event_id: entry.id,
    tenant_id: entry.tenant_id,
    replicate_to_cloud: false,
    entry,
  }))
  const response = await edgeFetch('/v1/events', {
    method: 'POST',
    body: JSON.stringify({ events }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `Cloudix LAN Edge respondió ${response.status}.`)
  }
}

export async function pullLanOutboxEntries(tenantId: string, limit = 500): Promise<LanEdgePullResult> {
  const cursor = readCursor(tenantId)
  const response = await edgeFetch(
    `/v1/events?tenant_id=${encodeURIComponent(tenantId)}&after=${cursor}&limit=${Math.max(1, Math.min(limit, 2_000))}`,
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `Cloudix LAN Edge respondió ${response.status}.`)
  }
  const payload = await response.json() as {
    events?: PulledLanEdgeEvent[]
    next_cursor?: number
    has_more?: boolean
  }
  return {
    events: Array.isArray(payload.events) ? payload.events : [],
    nextCursor: Number(payload.next_cursor ?? cursor) || cursor,
    hasMore: Boolean(payload.has_more),
  }
}
