import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_LAN_EDGE_PORT = 47821

export interface LanEdgeEventEnvelope {
  event_id: string
  tenant_id: string
  replicate_to_cloud: boolean
  entry: Record<string, unknown>
}

interface StoredLanEdgeEvent extends LanEdgeEventEnvelope {
  seq: number
  received_at: string
}

export interface LanEdgeServerHandle {
  port: number
  urls: string[]
  close: () => Promise<void>
}

interface StartLanEdgeServerOptions {
  dataDir: string
  distDir: string
  port?: number
}

const MAX_BODY_BYTES = 10 * 1024 * 1024
const MAX_PULL_LIMIT = 2_000

function isPrivateOrLoopbackAddress(rawAddress: string | undefined): boolean {
  if (!rawAddress) return false
  const address = rawAddress.replace(/^::ffff:/, '')
  if (address === '::1' || address === '127.0.0.1') return true
  if (address.startsWith('10.')) return true
  if (address.startsWith('192.168.')) return true
  const match = address.match(/^172\.(\d{1,3})\./)
  if (match) {
    const second = Number(match[1])
    return second >= 16 && second <= 31
  }
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true
  return false
}

function collectLanUrls(port: number): string[] {
  const urls = new Set<string>([`http://127.0.0.1:${port}`])
  const interfaces = os.networkInterfaces()
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.add(`http://${address.address}:${port}`)
      }
    }
  }
  return [...urls]
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(body)
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Payload LAN demasiado grande.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function isEnvelope(value: unknown): value is LanEdgeEventEnvelope {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.event_id === 'string' && row.event_id.length > 0 &&
    typeof row.tenant_id === 'string' && row.tenant_id.length > 0 &&
    typeof row.replicate_to_cloud === 'boolean' &&
    Boolean(row.entry) && typeof row.entry === 'object'
  )
}

function safeStaticPath(distDir: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidate = path.resolve(distDir, relative)
  const root = path.resolve(distDir)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null
  return candidate
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.woff2') return 'font/woff2'
  return 'application/octet-stream'
}

export async function startLanEdgeServer(options: StartLanEdgeServerOptions): Promise<LanEdgeServerHandle> {
  const port = options.port ?? DEFAULT_LAN_EDGE_PORT
  fs.mkdirSync(options.dataDir, { recursive: true })
  const logPath = path.join(options.dataDir, 'cloudix-lan-edge-events.ndjson')
  const events: StoredLanEdgeEvent[] = []
  const eventIds = new Set<string>()
  let nextSequence = 1

  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      try {
        const stored = JSON.parse(line) as StoredLanEdgeEvent
        if (!isEnvelope(stored) || typeof stored.seq !== 'number') continue
        events.push(stored)
        eventIds.add(stored.event_id)
        nextSequence = Math.max(nextSequence, stored.seq + 1)
      } catch {
        // A damaged trailing line must not prevent restaurant operation.
      }
    }
  }

  const appendEvents = (incoming: LanEdgeEventEnvelope[]): StoredLanEdgeEvent[] => {
    const accepted: StoredLanEdgeEvent[] = []
    for (const envelope of incoming) {
      if (eventIds.has(envelope.event_id)) continue
      const stored: StoredLanEdgeEvent = {
        ...envelope,
        seq: nextSequence++,
        received_at: new Date().toISOString(),
      }
      eventIds.add(stored.event_id)
      events.push(stored)
      fs.appendFileSync(logPath, `${JSON.stringify(stored)}\n`, 'utf8')
      accepted.push(stored)
    }
    return accepted
  }

  const server = http.createServer(async (request, response) => {
    if (!isPrivateOrLoopbackAddress(request.socket.remoteAddress)) {
      sendJson(response, 403, { ok: false, error: 'Cloudix Edge solo acepta conexiones desde la red local.' })
      return
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      })
      response.end()
      return
    }

    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || `127.0.0.1:${port}`}`)

    if (request.method === 'GET' && requestUrl.pathname === '/v1/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'cloudix-lan-edge',
        port,
        events: events.length,
        last_sequence: nextSequence - 1,
        urls: collectLanUrls(port),
      })
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/v1/events') {
      try {
        const body = await readJsonBody(request)
        const rawEvents = Array.isArray((body as { events?: unknown[] })?.events)
          ? (body as { events: unknown[] }).events
          : []
        const validEvents = rawEvents.filter(isEnvelope)
        if (validEvents.length !== rawEvents.length) {
          sendJson(response, 400, { ok: false, error: 'Uno o más eventos LAN son inválidos.' })
          return
        }
        const accepted = appendEvents(validEvents)
        sendJson(response, 200, {
          ok: true,
          accepted: accepted.length,
          duplicates: validEvents.length - accepted.length,
          last_sequence: nextSequence - 1,
        })
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo registrar el evento LAN.',
        })
      }
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/v1/events') {
      const tenantId = requestUrl.searchParams.get('tenant_id') || ''
      const after = Math.max(0, Number(requestUrl.searchParams.get('after') || 0) || 0)
      const limit = Math.min(
        MAX_PULL_LIMIT,
        Math.max(1, Number(requestUrl.searchParams.get('limit') || 500) || 500),
      )
      if (!tenantId) {
        sendJson(response, 400, { ok: false, error: 'tenant_id es obligatorio.' })
        return
      }
      const selected = events
        .filter((event) => event.tenant_id === tenantId && event.seq > after)
        .slice(0, limit)
      sendJson(response, 200, {
        ok: true,
        events: selected,
        next_cursor: selected.length > 0 ? selected[selected.length - 1].seq : after,
        has_more: selected.length === limit,
      })
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { ok: false, error: 'Método no permitido.' })
      return
    }

    let filePath = safeStaticPath(options.distDir, requestUrl.pathname)
    if (!filePath) {
      sendJson(response, 400, { ok: false, error: 'Ruta inválida.' })
      return
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(options.distDir, 'index.html')
    }
    if (!fs.existsSync(filePath)) {
      sendJson(response, 503, {
        ok: false,
        error: 'La interfaz local todavía no está compilada. Ejecutá npm run build.',
      })
      return
    }

    const stat = fs.statSync(filePath)
    response.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Content-Length': stat.size,
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    })
    if (request.method === 'HEAD') response.end()
    else fs.createReadStream(filePath).pipe(response)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const urls = collectLanUrls(port)
  console.info('[Cloudix LAN Edge] activo', { port, urls, logPath })

  return {
    port,
    urls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
