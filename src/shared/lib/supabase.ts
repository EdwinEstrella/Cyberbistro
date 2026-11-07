import { createClient } from '@supabase/supabase-js';
import { isDesktopCloudUnavailable, registerCloudAnonKey, registerCloudBaseUrl } from './cloudAvailability';
import {
  isSupabaseRequestTimeoutError,
  resolveSupabaseRequestTimeoutMs,
  SupabaseRequestTimeoutError,
} from './supabaseRequestTimeout';

const url = import.meta.env?.VITE_SUPABASE_URL?.trim() || process.env?.VITE_SUPABASE_URL?.trim() || process.env?.SUPABASE_URL?.trim() || 'https://ci-placeholder.supabase.co';
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env?.SUPABASE_PUBLISHABLE_KEY?.trim() || 'ci-placeholder-publishable-key';

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Configure both before starting Cloudix.');
}

registerCloudBaseUrl(url);
registerCloudAnonKey(publishableKey);

// Built-in db.timeout applies a single timeout to all PostgREST calls and omits /auth/v1/; global fetch enforces the per-method policy.
export const supabaseFetchWithTimeout: typeof fetch = async (input, init) => {
  const reqUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof (input as Request)?.url === 'string'
          ? (input as Request).url
          : '';

  const isProbe = reqUrl.includes('/auth/v1/settings') || reqUrl.includes('limit=1') || reqUrl === url;
  if (!isProbe && (await isDesktopCloudUnavailable().catch(() => false))) {
    throw new TypeError('Failed to fetch (cloud is offline)');
  }

  if (init?.signal?.aborted) {
    return fetch(input, init);
  }

  const reqMethod =
    init?.method ??
    (typeof (input as Request)?.method === 'string' ? (input as Request).method : undefined);

  const timeoutMs = resolveSupabaseRequestTimeoutMs(reqUrl, reqMethod);
  const controller = new AbortController();
  let timeoutError: SupabaseRequestTimeoutError | null = null;

  const timeoutId = setTimeout(() => {
    timeoutError = new SupabaseRequestTimeoutError(timeoutMs);
    controller.abort(timeoutError);
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort(init?.signal?.reason);
  };

  if (init?.signal) {
    init.signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (fetchError: unknown) {
    if (timeoutError) {
      throw timeoutError;
    }
    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
    if (init?.signal) {
      init.signal.removeEventListener('abort', onCallerAbort);
    }
  }
};

export const supabase = createClient(url, publishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: supabaseFetchWithTimeout },
});

export function createIsolatedAuthClient() {
  return createClient(url!, publishableKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
    global: { fetch: supabaseFetchWithTimeout },
  });
}

export function getSupabaseResolvedBaseUrl(): string {
  return url!;
}

export const SUPABASE_CONNECTIVITY_MESSAGE =
  'No se pudo conectar con Supabase. Comprobá tu conexión a internet o el estado del backend.';

function readErrorName(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as { name: unknown }).name === 'string'
  ) {
    return (error as { name: string }).name;
  }
  return '';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

export function formatSupabaseConnectivityError(error: unknown): string | null {
  if (isSupabaseRequestTimeoutError(error)) {
    return SUPABASE_CONNECTIVITY_MESSAGE;
  }

  const name = readErrorName(error);
  if (name === 'TimeoutError' || name === 'AbortError') {
    return SUPABASE_CONNECTIVITY_MESSAGE;
  }

  const message = readErrorMessage(error).toLowerCase();
  if (/failed to fetch|network|timeout|dns|connection|abort|timed out/.test(message)) {
    return SUPABASE_CONNECTIVITY_MESSAGE;
  }

  return null;
}
