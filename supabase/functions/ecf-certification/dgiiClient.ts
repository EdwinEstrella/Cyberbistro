// Minimal DGII e-CF client on `fetch` (Deno edge runtime and vitest). Mirrors the URL composition of
// dgii-ecf 1.8.0 (modulo-ecf/src/networking/RestApi.ts + restClient.ts) without its axios client:
// that client needs Node's https.Agent and keeps a process-wide bearer token, which would leak across
// tenants in a shared edge isolate. Here the token is a per-call value passed explicitly.
// Never log tokens, seeds or XML.

export type DgiiEnvironment = "test" | "certification" | "production";

const ENVIRONMENT_PATH: Record<DgiiEnvironment, string> = {
  test: "TesteCF",
  certification: "CerteCF",
  production: "eCF",
};

export const DGII_HOSTS = {
  /** Reception, authentication and status (credito fiscal and the rest). */
  ecf: "https://ecf.dgii.gov.do",
  /** Summaries (RFCE) of consumo invoices below RD$250k. */
  fc: "https://fc.dgii.gov.do",
} as const;

export function isDgiiEnvironment(value: unknown): value is DgiiEnvironment {
  return typeof value === "string" && value in ENVIRONMENT_PATH;
}

export function dgiiUrls(environment: DgiiEnvironment) {
  const path = ENVIRONMENT_PATH[environment];
  return {
    seed: `${DGII_HOSTS.ecf}/${path}/Autenticacion/api/Autenticacion/Semilla`,
    validateSeed: `${DGII_HOSTS.ecf}/${path}/autenticacion/api/Autenticacion/ValidarSemilla`,
    sendEcf: `${DGII_HOSTS.ecf}/${path}/recepcion/api/FacturasElectronicas`,
    sendRfce: `${DGII_HOSTS.fc}/${path}/recepcionfc/api/recepcion/ecf`,
    trackStatus: `${DGII_HOSTS.ecf}/${path}/consultaresultado/api/Consultas/Estado`,
  };
}

export interface DgiiMessage {
  codigo: string | null;
  valor: string;
}

export interface DgiiToken {
  token: string;
  expiresAt: string | null;
  issuedAt: string | null;
}

/** Answer of a reception or summary submission that DGII processed (2xx, or 4xx with a JSON body). */
export interface DgiiSendResult {
  httpStatus: number;
  trackId: string | null;
  /** Summaries answer synchronously with estado/codigo; reception answers with a trackId. */
  estado: string | null;
  codigo: number | null;
  messages: DgiiMessage[];
}

export interface DgiiTrackResult {
  trackId: string | null;
  estado: string | null;
  codigo: number | null;
  encf: string | null;
  messages: DgiiMessage[];
}

export type DgiiErrorKind = "network" | "timeout" | "unauthorized" | "http" | "invalid_response";

export class DgiiError extends Error {
  constructor(
    readonly kind: DgiiErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly messages: DgiiMessage[] = [],
  ) {
    super(message);
    this.name = "DgiiError";
  }
}

export interface DgiiClient {
  /** Seed -> signSeed(seed XML, root SemillaModel) -> ValidarSemilla -> bearer token. */
  authenticate(signSeed: (seedXml: string) => string | Promise<string>): Promise<DgiiToken>;
  sendEcf(token: string, fileName: string, signedXml: string): Promise<DgiiSendResult>;
  sendRfce(token: string, fileName: string, signedXml: string): Promise<DgiiSendResult>;
  trackStatus(token: string, trackId: string): Promise<DgiiTrackResult>;
}

export interface DgiiClientOptions {
  environment: DgiiEnvironment;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Multipart boundary factory (tests pin it). */
  boundary?: () => string;
}

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 500;
const FILE_NAME = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * multipart/form-data with a single `xml` file part, built by hand so the body is a fixed-length
 * byte array: DGII rejects chunked multipart ("Multipart cannot be empty") and dgii-ecf had to force
 * Content-Length for the same reason.
 */
export function buildMultipart(fileName: string, xml: string, boundary: string): { body: Uint8Array; contentType: string } {
  if (!FILE_NAME.test(fileName)) throw new Error("Invalid file name for DGII submission.");
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="xml"; filename="${fileName}"\r\nContent-Type: text/xml\r\n\r\n`,
  );
  const content = encoder.encode(xml);
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + content.length + tail.length);
  body.set(head, 0);
  body.set(content, head.length);
  body.set(tail, head.length + content.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function clip(value: string): string {
  return value.length > MAX_MESSAGE_LENGTH ? `${value.slice(0, MAX_MESSAGE_LENGTH)}...` : value;
}

/** Normalizes DGII `mensajes` (objects or strings) plus a top-level `error`/`message` string. */
export function parseMessages(body: unknown): DgiiMessage[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const out: DgiiMessage[] = [];
  const raw = Array.isArray(record.mensajes) ? record.mensajes : [];
  for (const entry of raw) {
    if (out.length >= MAX_MESSAGES) break;
    if (typeof entry === "string" && entry.trim()) out.push({ codigo: null, valor: clip(entry.trim()) });
    else if (entry && typeof entry === "object") {
      const item = entry as Record<string, unknown>;
      const valor = typeof item.valor === "string" ? item.valor : typeof item.mensaje === "string" ? item.mensaje : "";
      const codigo = typeof item.codigo === "number" || typeof item.codigo === "string" ? String(item.codigo) : null;
      if (valor.trim() || codigo) out.push({ codigo, valor: clip(valor.trim()) });
    }
  }
  for (const key of ["error", "message", "title"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && out.length < MAX_MESSAGES) {
      out.push({ codigo: null, valor: clip(value.trim()) });
      break;
    }
  }
  return out;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new DgiiError("invalid_response", "DGII response is too large.", res.status);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createDgiiClient(options: DgiiClientOptions): DgiiClient {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const boundary = options.boundary ?? (() => `----cloudix-${crypto.randomUUID()}`);
  const urls = dgiiUrls(options.environment);

  async function once(url: string, init: RequestInit): Promise<{ status: number; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { ...init, signal: controller.signal });
      return { status: res.status, text: await readText(res) };
    } catch (error) {
      if (error instanceof DgiiError) throw error;
      if (controller.signal.aborted) throw new DgiiError("timeout", "DGII did not answer in time.");
      throw new DgiiError("network", "DGII could not be reached.");
    } finally {
      clearTimeout(timer);
    }
  }

  /** At most one retry, only on network/timeout errors and only for idempotent calls. */
  async function request(url: string, init: RequestInit, retry: boolean): Promise<{ status: number; text: string }> {
    try {
      return await once(url, init);
    } catch (error) {
      if (retry && error instanceof DgiiError && (error.kind === "network" || error.kind === "timeout")) {
        return once(url, init);
      }
      throw error;
    }
  }

  function failOnStatus(status: number, text: string): void {
    if (status === 401 || status === 403) throw new DgiiError("unauthorized", "DGII rejected the credentials.", status);
    if (status >= 500) throw new DgiiError("http", "DGII service error.", status, parseMessages(parseJson(text)));
  }

  async function submit(url: string, token: string, fileName: string, signedXml: string): Promise<DgiiSendResult> {
    const { body, contentType } = buildMultipart(fileName, signedXml, boundary());
    // No retry: a timed-out POST may have been received, and resending burns the sequence.
    const { status, text } = await request(
      url,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": contentType }, body },
      false,
    );
    failOnStatus(status, text);
    const json = parseJson(text);
    if (!json || typeof json !== "object") {
      if (status >= 200 && status < 300) throw new DgiiError("invalid_response", "DGII answered without a JSON body.", status);
      throw new DgiiError("http", "DGII rejected the request.", status);
    }
    const record = json as Record<string, unknown>;
    return {
      httpStatus: status,
      trackId: str(record.trackId),
      estado: str(record.estado),
      codigo: num(record.codigo),
      messages: parseMessages(record),
    };
  }

  return {
    async authenticate(signSeed) {
      const seed = await request(urls.seed, { method: "GET", headers: { Accept: "application/xml" } }, true);
      failOnStatus(seed.status, seed.text);
      if (seed.status < 200 || seed.status >= 300 || !seed.text.includes("<SemillaModel")) {
        throw new DgiiError("invalid_response", "DGII did not return a seed.", seed.status);
      }
      const signed = await signSeed(seed.text);
      const { body, contentType } = buildMultipart("signed.xml", signed, boundary());
      const res = await request(
        urls.validateSeed,
        { method: "POST", headers: { Accept: "application/json", "Content-Type": contentType }, body },
        true,
      );
      failOnStatus(res.status, res.text);
      const json = parseJson(res.text) as Record<string, unknown> | null;
      if (res.status < 200 || res.status >= 300) {
        throw new DgiiError("unauthorized", "DGII did not accept the signed seed.", res.status, parseMessages(json));
      }
      const token = str(json?.token);
      if (!token) throw new DgiiError("invalid_response", "DGII did not return a token.", res.status);
      return { token, expiresAt: str(json?.expira), issuedAt: str(json?.expedido) };
    },

    sendEcf: (token, fileName, signedXml) => submit(urls.sendEcf, token, fileName, signedXml),
    sendRfce: (token, fileName, signedXml) => submit(urls.sendRfce, token, fileName, signedXml),

    async trackStatus(token, trackId) {
      const url = `${urls.trackStatus}?trackId=${encodeURIComponent(trackId)}`;
      const { status, text } = await request(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, true);
      failOnStatus(status, text);
      const json = parseJson(text);
      if (!json || typeof json !== "object") throw new DgiiError("invalid_response", "DGII answered without a JSON body.", status);
      if (status < 200 || status >= 300) throw new DgiiError("http", "DGII rejected the status query.", status, parseMessages(json));
      const record = json as Record<string, unknown>;
      return {
        trackId: str(record.trackId),
        estado: str(record.estado),
        codigo: num(record.codigo),
        encf: str(record.encf),
        messages: parseMessages(record),
      };
    },
  };
}
