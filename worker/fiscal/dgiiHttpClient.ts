import https from "node:https";

/**
 * Mirrors the cipher suite used by dgii-ecf@1.8.0 (src/networking/restClient.ts).
 * Keep in sync if dgii-ecf upstream changes its cipher list.
 */
export const DGII_ECF_CIPHERS = [
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "DHE-RSA-AES128-GCM-SHA256",
  "DHE-RSA-AES256-GCM-SHA384",
].join(":");

export const DEFAULT_DGII_HTTP_TIMEOUT_MS = 25_000;

export interface DgiiHttpClientOptions {
  requestTimeoutMs: number;
}

export interface DgiiHttpClientLike {
  defaults: {
    timeout?: number;
    httpsAgent?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Reads DGII_HTTP_TIMEOUT_MS from environment.
 * Must be a positive integer, otherwise defaults to 25_000ms.
 */
export function resolveDgiiHttpTimeoutMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DGII_HTTP_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_DGII_HTTP_TIMEOUT_MS;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_DGII_HTTP_TIMEOUT_MS;
}

/**
 * Configures the module-level Axios instance used by dgii-ecf.
 *
 * Sets the request timeout and replaces the keep-alive HTTPS agent with an agent
 * that has keepAlive: false, socket timeout, and identical TLS cipher suites to
 * prevent socket hang/stale keep-alive connections on DGII endpoints.
 *
 * Idempotent and free of import-time side effects.
 */
export function configureDgiiHttpClient<T extends DgiiHttpClientLike>(
  client: T,
  options: DgiiHttpClientOptions
): T {
  const { requestTimeoutMs } = options;

  client.defaults.timeout = requestTimeoutMs;

  const previousAgent = client.defaults.httpsAgent;
  if (
    previousAgent &&
    typeof previousAgent === "object" &&
    typeof (previousAgent as { destroy?: unknown }).destroy === "function"
  ) {
    (previousAgent as { destroy: () => void }).destroy();
  }

  client.defaults.httpsAgent = new https.Agent({
    keepAlive: false,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    ciphers: DGII_ECF_CIPHERS,
    honorCipherOrder: true,
    timeout: requestTimeoutMs,
  });

  return client;
}
