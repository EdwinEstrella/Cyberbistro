import { useState, useEffect, useCallback } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from '../lib/insforge';
import { INSFORGE_REFRESH_TOKEN_STORAGE_KEY } from '../lib/insforgeAuthStorage';
import {
  readTenantSessionCache,
  writeTenantSessionCache,
  clearTenantSessionCache,
  type TenantSessionRow,
} from '../lib/tenantSessionCache';
import { resolveTenantAccessForSession } from '../lib/resolveTenantUserFromAuth';
import { getLocalDeviceSession, setLastTenantId } from '../lib/localFirst';

interface TenantUser {
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string;
}

interface SharedAuthState {
  user: UserSchema | null;
  tenantUser: TenantUser | null;
  loading: boolean;
  tenantAccessDeniedReason: 'blocked' | 'unlinked' | null;
}

function rowToTenantUser(data: TenantSessionRow): TenantUser {
  return {
    tenant_id: data.tenant_id,
    email: data.email,
    rol: data.rol,
    nombre: data.nombre ?? '',
  };
}

const AUTH_RETRIES = 5;
const AUTH_LOG_PREFIX = '[AuthFlow]';
const REFRESH_BLOCK_MS = 30_000;
const REFRESH_TOKEN_KEY = INSFORGE_REFRESH_TOKEN_STORAGE_KEY;

let refreshInFlight: Promise<'ok' | 'unauthorized' | 'error'> | null = null;
let refreshBlockedUntil = 0;
let loadUserDataInFlight: Promise<void> | null = null;
let initializedOnce = false;
let activeConsumers = 0;
let cleanupGlobalListeners: (() => void) | null = null;

let isSigningOut = false;

const subscribers = new Set<() => void>();

const initialCached = readTenantSessionCache();
const sharedState: SharedAuthState = {
  user: null,
  tenantUser: initialCached ? rowToTenantUser(initialCached) : null,
  loading: true,
  tenantAccessDeniedReason: null,
};

function logAuth(message: string, payload?: unknown): void {
  if (payload === undefined) console.info(`${AUTH_LOG_PREFIX} ${message}`);
  else console.info(`${AUTH_LOG_PREFIX} ${message}`, payload);
}

function notifySubscribers(): void {
  subscribers.forEach((fn) => fn());
}

function patchSharedState(patch: Partial<SharedAuthState>): void {
  sharedState.user = patch.user === undefined ? sharedState.user : patch.user;
  sharedState.tenantUser =
    patch.tenantUser === undefined ? sharedState.tenantUser : patch.tenantUser;
  sharedState.loading = patch.loading === undefined ? sharedState.loading : patch.loading;
  sharedState.tenantAccessDeniedReason =
    patch.tenantAccessDeniedReason === undefined
      ? sharedState.tenantAccessDeniedReason
      : patch.tenantAccessDeniedReason;
  notifySubscribers();
}

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; message?: string; error?: string };
  if (e.statusCode === 401 || e.statusCode === 403) return true;
  const msg = `${e.error ?? ''} ${e.message ?? ''}`.toLowerCase();
  return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('invalid token');
}

function readRefreshToken(): string | null {
  const token = localStorage.getItem(REFRESH_TOKEN_KEY);
  return token && token.trim().length > 0 ? token : null;
}

function extractRefreshTokenFromPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybeData = data as any;
  const direct = maybeData.refreshToken || maybeData.refresh_token;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  const inSession = maybeData.session?.refreshToken || maybeData.session?.refresh_token;
  if (typeof inSession === 'string' && inSession.trim().length > 0) return inSession;
  const inTokens = maybeData.tokens?.refreshToken || maybeData.tokens?.refresh_token;
  if (typeof inTokens === 'string' && inTokens.trim().length > 0) return inTokens;
  return null;
}

function extractAccessTokenFromPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const maybeData = data as any;
  const direct = maybeData.accessToken || maybeData.access_token;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  const inSession = maybeData.session?.accessToken || maybeData.session?.access_token;
  if (typeof inSession === 'string' && inSession.trim().length > 0) return inSession;
  const inTokens = maybeData.tokens?.accessToken || maybeData.tokens?.access_token;
  if (typeof inTokens === 'string' && inTokens.trim().length > 0) return inTokens;
  return null;
}

function extractUserFromAuthPayload(data: unknown): UserSchema | null {
  if (!data || typeof data !== 'object') return null;
  const maybeData = data as {
    user?: unknown;
    session?: { user?: unknown };
  };
  if (maybeData.user && typeof maybeData.user === 'object') {
    return maybeData.user as UserSchema;
  }
  if (maybeData.session?.user && typeof maybeData.session.user === 'object') {
    return maybeData.session.user as UserSchema;
  }
  return null;
}

function syncSdkSession(data: unknown): void {
  const accessToken = extractAccessTokenFromPayload(data);
  const user = extractUserFromAuthPayload(data);

  try {
    if (accessToken) {
      insforgeClient.getHttpClient().setAuthToken(accessToken);
      const tokenManager = (insforgeClient as unknown as {
        tokenManager?: {
          setAccessToken?: (token: string) => void;
          setUser?: (nextUser: UserSchema) => void;
        };
      }).tokenManager;
      tokenManager?.setAccessToken?.(accessToken);
      if (user) tokenManager?.setUser?.(user);
    }
  } catch {
    /* best effort: InsForge SDK internals are not public API */
  }
}

function clearSessionShared(): void {
  clearTenantSessionCache();
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  import('../lib/localFirst').then(m => {
    m.getLastTenantId().then(tenantId => {
      if (tenantId) m.clearLocalDeviceSession(tenantId);
    });
  });
  try {
    insforgeClient.getHttpClient().setAuthToken(null);
    insforgeClient.getHttpClient().setRefreshToken(null);
    const tokenManager = (insforgeClient as unknown as {
      tokenManager?: { clearSession?: () => void };
    }).tokenManager;
    tokenManager?.clearSession?.();
  } catch {
    /* ignore */
  }
  patchSharedState({ user: null, tenantUser: null, tenantAccessDeniedReason: null, loading: false });
}

export function hydrateAuthStateAfterLogin(user: UserSchema, tenantRow: TenantSessionRow): void {
  writeTenantSessionCache(user.id, tenantRow);
  setLastTenantId(tenantRow.tenant_id);
  refreshBlockedUntil = 0;
  initializedOnce = true;
  patchSharedState({
    user,
    tenantUser: rowToTenantUser(tenantRow),
    tenantAccessDeniedReason: null,
    loading: false,
  });
  logAuth('hydrate-after-login', {
    userId: user.id,
    tenantId: tenantRow.tenant_id,
    rol: tenantRow.rol,
  });
}

export function syncAuthClientAfterLogin(data: unknown): void {
  syncSdkSession(data);
}

async function loadUserDataShared(opts?: { silent?: boolean }): Promise<void> {
  if (loadUserDataInFlight) {
    await loadUserDataInFlight;
    return;
  }

  loadUserDataInFlight = (async () => {
    const silent = opts?.silent === true;
    logAuth('loadUserData:start', { silent });
    if (!silent) patchSharedState({ loading: true });

    try {
      let u: UserSchema | null = null;

      for (let attempt = 0; attempt < AUTH_RETRIES; attempt++) {
        logAuth('auth attempt', { attempt: attempt + 1, total: AUTH_RETRIES });
        if (attempt > 0) await new Promise((r) => setTimeout(r, 280 * attempt));

        const { data, error } = await insforgeClient.auth.getCurrentUser();
        if (error) {
          logAuth('getCurrentUser:error', error);
          if (isUnauthorizedError(error)) break;
          continue;
        }
        if (data?.user) {
          u = data.user;
          break;
        }
      }

      if (!u) {
        const storedToken = readRefreshToken();
        logAuth('loadUserData:no-user', { hasStoredRefreshToken: Boolean(storedToken) });

        if (storedToken) {
          try {
            insforgeClient.getHttpClient().setRefreshToken(storedToken);
          } catch {
            /* ignore */
          }
          logAuth('bootstrap refresh:start', { tokenLength: storedToken.length });
          const { data: refreshed, error: refreshError } = await insforgeClient.auth.refreshSession({
            refreshToken: storedToken,
          });

          if (!refreshError) {
            syncSdkSession(refreshed);
            const rotated = extractRefreshTokenFromPayload(refreshed);
            if (rotated) localStorage.setItem(REFRESH_TOKEN_KEY, rotated);
            const refreshedUser = extractUserFromAuthPayload(refreshed);
            logAuth('bootstrap refresh:ok', {
              rotatedToken: Boolean(rotated),
              hasUserInPayload: Boolean(refreshedUser),
            });

            if (refreshedUser) {
              u = refreshedUser;
              patchSharedState({ user: u });
              logAuth('loadUserData:user-ok-from-bootstrap-refresh-payload', {
                userId: u.id,
                email: u.email,
              });
            } else {
              const { data: authDataAfterRefresh, error: authErrorAfterRefresh } =
                await insforgeClient.auth.getCurrentUser();
              if (!authErrorAfterRefresh && authDataAfterRefresh?.user) {
                u = authDataAfterRefresh.user;
                patchSharedState({ user: u });
                logAuth('loadUserData:user-ok-after-bootstrap-refresh', {
                  userId: u.id,
                  email: u.email,
                });
              } else {
                logAuth('bootstrap refresh:no-user-after-refresh', {
                  hasAuthError: Boolean(authErrorAfterRefresh),
                });
              }
            }
          } else if (isUnauthorizedError(refreshError)) {
            refreshBlockedUntil = Date.now() + REFRESH_BLOCK_MS;
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            logAuth('bootstrap refresh unauthorized -> token removed', refreshError);
          } else {
            logAuth('bootstrap refresh transient error', refreshError);
          }
        }

        if (!u) {
          const localSession = await getLocalDeviceSession();
          if (localSession) {
            u = {
              id: localSession.user_id,
              email: localSession.email,
              app_metadata: {},
              user_metadata: {},
              aud: '',
              created_at: '',
            } as unknown as UserSchema;
            patchSharedState({ user: u, tenantUser: localSession.tenant_user_row as unknown as TenantUser, loading: false });
            logAuth('loadUserData:offline-session-ok', { userId: u.id, email: u.email });
            return;
          }
          return;
        }
      }

      patchSharedState({ user: u });
      logAuth('loadUserData:user-ok', { userId: u.id, email: u.email });

      const cached = readTenantSessionCache();
      if (cached?.authUserId === u.id) {
        patchSharedState({ tenantUser: rowToTenantUser(cached) });
        logAuth('tenant cache hit', { tenantId: cached.tenant_id, rol: cached.rol });
      }

      const access = await resolveTenantAccessForSession(u);
      if (access.status === 'active') {
        patchSharedState({
          tenantUser: rowToTenantUser(access.row),
          tenantAccessDeniedReason: null,
        });
        writeTenantSessionCache(u.id, access.row);
        logAuth('tenant resolved from backend', {
          tenantId: access.row.tenant_id,
          rol: access.row.rol,
        });
      } else {
        clearTenantSessionCache();
        patchSharedState({ tenantUser: null, tenantAccessDeniedReason: access.status });
        logAuth('tenant not resolved from backend -> cache cleared', { reason: access.status });
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      if (!silent) patchSharedState({ loading: false });
      logAuth('loadUserData:end', { silent });
    }
  })();

  try {
    await loadUserDataInFlight;
  } finally {
    loadUserDataInFlight = null;
  }
}

async function doRefreshShared(): Promise<void> {
  if (isSigningOut) {
    logAuth('focus/visibility/interval refresh skipped (signing out)');
    return;
  }

  const currentUser = sharedState.user;
  logAuth('focus/visibility/interval refresh triggered', {
    hasUser: Boolean(currentUser),
    hasStoredRefresh: Boolean(readRefreshToken()),
  });

  if (Date.now() < refreshBlockedUntil) {
    logAuth('refreshSession:skip-blocked');
    return;
  }

  if (refreshInFlight) {
    logAuth('refreshSession:skip-in-flight');
    await refreshInFlight;
    return;
  }

  refreshInFlight = (async (): Promise<'ok' | 'unauthorized' | 'error'> => {
    const storedToken = readRefreshToken();
    if (!storedToken) {
      logAuth('refreshSession:no-token-stored -> loadUserData');
      await loadUserDataShared({ silent: true });
      return 'ok';
    }

    try {
      insforgeClient.getHttpClient().setRefreshToken(storedToken);
    } catch {
      /* ignore */
    }

    const { data, error } = await insforgeClient.auth.refreshSession({
      refreshToken: storedToken,
    });

    if (error) {
      logAuth('refreshSession:error', error);
      if (isUnauthorizedError(error)) {
        refreshBlockedUntil = Date.now() + REFRESH_BLOCK_MS;
        logAuth('refreshSession:unauthorized -> clearing session');
        clearSessionShared();
        return 'unauthorized';
      }
      logAuth('refreshSession:transient-error -> keeping session');
      return 'error';
    }

    syncSdkSession(data);
    const refreshToken = extractRefreshTokenFromPayload(data);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      logAuth('refreshSession:ok -> token updated');
    } else {
      logAuth('refreshSession:ok');
    }

    const refreshedUser = extractUserFromAuthPayload(data);
    if (refreshedUser) {
      patchSharedState({ user: refreshedUser });
      logAuth('refreshSession:ok -> user updated from payload', { userId: refreshedUser.id });
    }

    refreshBlockedUntil = 0;
    return 'ok';
  })();

  const result = await refreshInFlight;
  refreshInFlight = null;
  if (result === 'ok') {
    await loadUserDataShared({ silent: true });
  }
}

/** Intervalo de rotación: el cliente PostgREST no pasa por el `request()` del SDK, así que renovamos antes de que venza el access. */
const SESSION_ROTATE_MS = 9 * 60 * 1000;

function ensureGlobalListeners(): void {
  if (cleanupGlobalListeners) return;
  const onFocus = () => void doRefreshShared();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void doRefreshShared();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  const intervalId = window.setInterval(() => void doRefreshShared(), SESSION_ROTATE_MS);
  logAuth('listeners attached', {
    events: ['focus', 'visibilitychange', `interval:${SESSION_ROTATE_MS}ms`],
  });
  cleanupGlobalListeners = () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(intervalId);
    logAuth('listeners detached');
    cleanupGlobalListeners = null;
  };
}

/**
 * Renueva el access token cuando hay refresh en localStorage (flujo mobile / `isServerMode`).
 * Útil antes de operaciones PostgREST (p. ej. facturar): esas rutas no disparan el retry 401 del `HttpClient`.
 */
export async function ensureAuthSessionFresh(): Promise<void> {
  await doRefreshShared();
}

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(sharedState.user);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(sharedState.tenantUser);
  const [loading, setLoading] = useState(sharedState.loading);
  const [tenantAccessDeniedReason, setTenantAccessDeniedReason] = useState(sharedState.tenantAccessDeniedReason);

  useEffect(() => {
    const sync = () => {
      setUser(sharedState.user);
      setTenantUser(sharedState.tenantUser);
      setLoading(sharedState.loading);
      setTenantAccessDeniedReason(sharedState.tenantAccessDeniedReason);
    };
    subscribers.add(sync);
    activeConsumers += 1;
    sync();

    ensureGlobalListeners();
    if (!initializedOnce || sharedState.user == null) {
      initializedOnce = true;
      logAuth('mount: auth load', { reason: sharedState.user ? 'first-mount' : 'missing-user' });
      void loadUserDataShared({ silent: false });
    }

    return () => {
      subscribers.delete(sync);
      activeConsumers = Math.max(0, activeConsumers - 1);
      if (activeConsumers === 0 && cleanupGlobalListeners) {
        cleanupGlobalListeners();
      }
    };
  }, []);

  const signOut = useCallback(async () => {
    isSigningOut = true;
    logAuth('signOut:start');
    try {
      const { error } = await insforgeClient.auth.signOut();
      if (error) console.error('Error signing out:', error);
    } catch (e) {
      console.error('Exception signing out:', e);
    } finally {
      refreshInFlight = null;
      loadUserDataInFlight = null;
      refreshBlockedUntil = 0;
      initializedOnce = false;
      clearSessionShared();
      isSigningOut = false;
      logAuth('signOut:done');
    }
  }, []);

  const refreshSession = useCallback((opts?: { showLoading?: boolean }) => {
    void loadUserDataShared({ silent: opts?.showLoading !== true });
  }, []);

  const cachedRow = user ? readTenantSessionCache() : null;
  const cacheBelongsToUser = cachedRow != null && user != null && cachedRow.authUserId === user.id;
  const tenantUserEffective = tenantUser ?? (cacheBelongsToUser ? rowToTenantUser(cachedRow) : null);

  return {
    user,
    tenantUser: tenantUserEffective,
    tenantId: tenantUserEffective?.tenant_id ?? null,
    rol: tenantUserEffective?.rol ?? null,
    loading,
    signOut,
    isAuthenticated: !!user,
    refreshSession,
    tenantAccessDeniedReason,
  };
}
