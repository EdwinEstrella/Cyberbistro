import { createClient } from '@insforge/sdk';
import type { InsForgeConfig, InsForgeClient } from '@insforge/sdk';
import { INSFORGE_REFRESH_TOKEN_STORAGE_KEY } from './insforgeAuthStorage';

const FALLBACK_BASE_URL = 'https://restaurante.azokia.com';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4';
const ENV_BASE_URL = import.meta.env.VITE_INSFORGE_BASE_URL?.trim();
const ENV_ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();

/** Solo true si ambas variables de build están definidas; nunca mezclar URL de env con key de fallback. */
export const isInsforgeEnvConfigured = Boolean(ENV_BASE_URL && ENV_ANON_KEY);

const hasPartialEnv =
  Boolean(ENV_BASE_URL || ENV_ANON_KEY) && !isInsforgeEnvConfigured;

const effectiveBaseUrl = isInsforgeEnvConfigured
  ? (ENV_BASE_URL as string)
  : FALLBACK_BASE_URL;
const effectiveAnonKey = isInsforgeEnvConfigured
  ? (ENV_ANON_KEY as string)
  : FALLBACK_ANON_KEY;

/** Para mensajes de error (login) y logs; coincide con la URL del cliente InsForge. */
export function getInsforgeResolvedBaseUrl(): string {
  return effectiveBaseUrl;
}

/** Errores de red/DNS que no suelen traer un cuerpo JSON útil del API. */
export function formatInsforgeConnectivityError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { message?: string; statusCode?: number; error?: string };
  const msg = `${e.message ?? ''}`.toLowerCase();
  const code = `${e.error ?? ''}`.toLowerCase();
  const looksNetwork =
    (e.statusCode === 0 && (e.error === 'NETWORK_ERROR' || code === 'network_error')) ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('net::err_') ||
    msg.includes('load failed') ||
    msg.includes('networkerror');

  if (!looksNetwork) return null;

  const url = getInsforgeResolvedBaseUrl();
  const envHint = isInsforgeEnvConfigured
    ? 'Comprobá tu conexión a internet o que el backend esté en línea.'
    : 'Estás usando la URL embebida del proyecto (sin .env completo). Si ese host ya no existe o no resuelve en DNS, creá un archivo `.env` en la raíz con `VITE_INSFORGE_BASE_URL` y `VITE_INSFORGE_ANON_KEY` (copialos del panel de InsForge; podés usar los mismos que en Nexo/Zyron si comparten backend).';

  return `No se pudo conectar a ${url}. ${envHint}`;
}

function readInsforgeConfig(): InsForgeConfig {
  if (hasPartialEnv) {
    console.warn(
      'Cloudix: .env incompleto (definí **ambas** VITE_INSFORGE_BASE_URL y VITE_INSFORGE_ANON_KEY, o ninguna). Se usan los valores embebidos del build para no mezclar URL y clave.'
    );
  }
  return {
    baseUrl: effectiveBaseUrl,
    anonKey: effectiveAnonKey,
    /**
     * `false` prevent the SDK from auto-refreshing internally and burning the token
     * without exposing the new rotated token to localStorage.
     */
    autoRefreshToken: false,
    /** Flujo `client_type=mobile` + refresh en body; adecuado para Electron (InsForge SDK). */
    isServerMode: true,
  };
}

/** Tras reiniciar la app, el `HttpClient` pierde el refresh en RAM; lo rehidratamos desde localStorage. */
function primeHttpClientRefreshFromStorage(client: InsForgeClient): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const token = localStorage.getItem(INSFORGE_REFRESH_TOKEN_STORAGE_KEY)?.trim();
    if (token) client.getHttpClient().setRefreshToken(token);
  } catch {
    /* storage no accesible */
  }
}

/**
 * Cliente InsForge para el renderer de **Electron** (Chromium embebido, uso en escritorio).
 * No es un sitio público en la web, pero el .asar sigue siendo inspeccionable: solo anonKey aquí.
 *
 * Si aparece "Invalid token" de inmediato tras deploy, revisá anon key / URL del proyecto.
 * Si aparece tras mucho tiempo de uso, suele ser access token caducado: ver `useAuth` y refresh en localStorage.
 */
const _insforgeClient = createClient(readInsforgeConfig());
primeHttpClientRefreshFromStorage(_insforgeClient);
export const insforgeClient = _insforgeClient;

const source = isInsforgeEnvConfigured ? 'env' : 'embedded';
console.info('[InsForge] client initialized', {
  baseUrl: effectiveBaseUrl,
  source,
  autoRefreshToken: false,
  isServerMode: true,
});
