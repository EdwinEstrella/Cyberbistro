import { createClient } from '@insforge/sdk';
import type { InsForgeConfig } from '@insforge/sdk';

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

function readInsforgeConfig(): InsForgeConfig {
  if (hasPartialEnv) {
    console.warn(
      'Cyberbistro: .env incompleto (definí **ambas** VITE_INSFORGE_BASE_URL y VITE_INSFORGE_ANON_KEY, o ninguna). Se usan los valores embebidos del build para no mezclar URL y clave.'
    );
  }
  return {
    baseUrl: effectiveBaseUrl,
    anonKey: effectiveAnonKey,
    // En Electron gestionamos refresh manualmente al recuperar foco.
    autoRefreshToken: false,
    // Campos opcionales soportados por versiones recientes del SDK.
    persistSession: true,
    isServerMode: true,
  } as InsForgeConfig;
}

/**
 * Cliente InsForge para el renderer de **Electron** (Chromium embebido, uso en escritorio).
 * No es un sitio público en la web, pero el .asar sigue siendo inspeccionable: solo anonKey aquí.
 *
 * Si aparece "Invalid token", regenerá la anon key en InsForge y actualizá las variables de build (o estos fallbacks) antes del release.
 */
export const insforgeClient = createClient(readInsforgeConfig());

const source = isInsforgeEnvConfigured ? 'env' : 'embedded';
console.info('[InsForge] client initialized', {
  baseUrl: effectiveBaseUrl,
  source,
  autoRefreshToken: false,
  persistSession: true,
});
