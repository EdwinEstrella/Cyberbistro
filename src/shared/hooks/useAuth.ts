import { useState, useEffect, useCallback } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient, isInsforgeEnvConfigured } from '../lib/insforge';
import {
  readTenantSessionCache,
  writeTenantSessionCache,
  clearTenantSessionCache,
  type TenantSessionRow,
} from '../lib/tenantSessionCache';
import { resolveTenantUserForSession } from '../lib/resolveTenantUserFromAuth';

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
const REFRESH_TOKEN_KEY = 'insforge_refresh_token';

let refreshInFlight: Promise<'ok' | 'unauthorized' | 'error'> | null = null;
let refreshBlockedUntil = 0;
let loadUserDataInFlight: Promise<void> | null = null;
let initializedOnce = false;
let activeConsumers = 0;
let cleanupGlobalListeners: (() => void) | null = null;

const subscribers = new Set<() => void>();

const initialCached = readTenantSessionCache();
const sharedState: SharedAuthState = {
  user: null,
  tenantUser: initialCached ? rowToTenantUser(initialCached) : null,
  loading: true,
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
  const maybeData = data as {
    refreshToken?: unknown;
    session?: { refreshToken?: unknown };
    tokens?: { refreshToken?: unknown };
  };
  const direct = maybeData.refreshToken;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  const inSession = maybeData.session?.refreshToken;
  if (typeof inSession === 'string' && inSession.trim().length > 0) return inSession;
  const inTokens = maybeData.tokens?.refreshToken;
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

function clearSessionShared(): void {
  clearTenantSessionCache();
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  patchSharedState({ user: null, tenantUser: null });
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
          logAuth('bootstrap refresh:start', { tokenLength: storedToken.length });
          const { data: refreshed, error: refreshError } = await insforgeClient.auth.refreshSession({
            refreshToken: storedToken,
          });

          if (!refreshError) {
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

      const resolved = await resolveTenantUserForSession(u);
      if (resolved) {
        patchSharedState({ tenantUser: rowToTenantUser(resolved) });
        writeTenantSessionCache(u.id, resolved);
        logAuth('tenant resolved from backend', {
          tenantId: resolved.tenant_id,
          rol: resolved.rol,
        });
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
  const currentUser = sharedState.user;
  logAuth('focus/visibility refresh triggered', {
    hasUser: Boolean(currentUser),
    isInsforgeEnvConfigured,
  });

  if (!currentUser) {
    await loadUserDataShared({ silent: true });
    return;
  }

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
      logAuth('refreshSession:no-token-stored -> skip');
      await loadUserDataShared({ silent: true });
      return 'ok';
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

function ensureGlobalListeners(): void {
  if (cleanupGlobalListeners) return;
  const onFocus = () => void doRefreshShared();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void doRefreshShared();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  logAuth('listeners attached', { events: ['focus', 'visibilitychange'] });
  cleanupGlobalListeners = () => {
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    logAuth('listeners detached');
    cleanupGlobalListeners = null;
  };
}

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(sharedState.user);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(sharedState.tenantUser);
  const [loading, setLoading] = useState(sharedState.loading);

  useEffect(() => {
    const sync = () => {
      setUser(sharedState.user);
      setTenantUser(sharedState.tenantUser);
      setLoading(sharedState.loading);
    };
    subscribers.add(sync);
    activeConsumers += 1;
    sync();

    ensureGlobalListeners();
    if (!initializedOnce) {
      initializedOnce = true;
      logAuth('mount: initial auth load');
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
    logAuth('signOut:start');
    const { error } = await insforgeClient.auth.signOut();
    if (error) console.error('Error signing out:', error);
    clearSessionShared();
    logAuth('signOut:done');
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
  };
}
