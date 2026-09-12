import { createClient } from '@supabase/supabase-js';
import { registerCloudAnonKey, registerCloudBaseUrl } from './cloudAvailability';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Configure both before starting Cloudix.');
}

registerCloudBaseUrl(url);
registerCloudAnonKey(publishableKey);

export const supabase = createClient(url, publishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export function getSupabaseResolvedBaseUrl(): string {
  return url!;
}

export function formatSupabaseConnectivityError(error: unknown): string | null {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return /failed to fetch|network|timeout|dns|connection/.test(message)
    ? 'No se pudo conectar con Supabase. Comprobá tu conexión a internet o el estado del backend.'
    : null;
}
