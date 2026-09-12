import { createClient } from '@supabase/supabase-js';
import { isDesktopCloudUnavailable, registerCloudAnonKey, registerCloudBaseUrl } from './cloudAvailability';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Configure both before starting Cloudix.');
}

registerCloudBaseUrl(url);
registerCloudAnonKey(publishableKey);

const customFetch: typeof fetch = async (input, init) => {
  const reqUrl = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
  const isProbe = reqUrl.includes('/auth/v1/settings') || reqUrl.includes('limit=1') || reqUrl === url;
  if (!isProbe && (await isDesktopCloudUnavailable().catch(() => false))) {
    throw new TypeError('Failed to fetch (cloud is offline)');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const supabase = createClient(url, publishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: customFetch },
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
