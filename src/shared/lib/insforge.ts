import { createClient } from '@insforge/sdk';
import type { InsForgeConfig } from '@insforge/sdk';

const FALLBACK_BASE_URL = 'https://restaurante.azokia.com';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDAxMzF9.OQwbEoWPtw-inbXdU3D7c39RZn3c87FJ-HvMBF_jrn4';

function readInsforgeConfig(): InsForgeConfig {
  const baseUrl = import.meta.env.VITE_INSFORGE_BASE_URL?.trim();
  const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();
  if (!baseUrl || !anonKey) {
    console.warn(
      'Cyberbistro: faltan variables VITE_INSFORGE_* en el entorno. Se usa configuración fallback para evitar pantalla en blanco. Definí .env para tu backend.'
    );
  }
  return {
    baseUrl: baseUrl || FALLBACK_BASE_URL,
    anonKey: anonKey || FALLBACK_ANON_KEY,
    autoRefreshToken: true,
  };
}

/**
 * Cliente InsForge para el renderer de **Electron** (Chromium embebido, uso en escritorio).
 * No es un sitio público en la web, pero el .asar sigue siendo inspeccionable: solo anonKey aquí.
 *
 * Si aparece "Invalid token", regenerá la anon key en InsForge y actualizá `.env` antes del build.
 */
export const insforgeClient = createClient(readInsforgeConfig());
