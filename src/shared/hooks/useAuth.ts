import { useState, useEffect, useCallback, useRef } from 'react';
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

function logAuth(message: string, payload?: unknown): void {
  if (payload === undefined) console.info(`${AUTH_LOG_PREFIX} ${message}`);
  else console.info(`${AUTH_LOG_PREFIX} ${message}`, payload);
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

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(() => {
    const cached = readTenantSessionCache();
    return cached ? rowToTenantUser(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  const userRef = useRef<UserSchema | null>(null);
  userRef.current = user;

  const clearSession = useCallback(() => {
    clearTenantSessionCache();
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setTenantUser(null);
  }, []);

  const loadUserData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    logAuth('loadUserData:start', { silent });
    if (!silent) setLoading(true);

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
        logAuth('loadUserData:no-user', {
          hasStoredRefreshToken: Boolean(storedToken),
        });

        // Bootstrap de sesión en server-mode: intenta recuperar usuario usando refresh token.
        if (storedToken && isInsforgeEnvConfigured) {
          if (refreshInFlight) {
            logAuth('bootstrap refresh:reuse in-flight');
            await refreshInFlight;
          }
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
              setUser(u);
              logAuth('loadUserData:user-ok-from-bootstrap-refresh-payload', {
                userId: u.id,
                email: u.email,
              });
            } else {
              const { data: authDataAfterRefresh, error: authErrorAfterRefresh } =
                await insforgeClient.auth.getCurrentUser();
              if (!authErrorAfterRefresh && authDataAfterRefresh?.user) {
                u = authDataAfterRefresh.user;
                setUser(u);
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
          if (!userRef.current) {
            setLoading(false);
          }
          return;
        }
      }

      setUser(u);
      logAuth('loadUserData:user-ok', { userId: u.id, email: u.email });

      const cached = readTenantSessionCache();
      if (cached?.authUserId === u.id) {
        setTenantUser(rowToTenantUser(cached));
        logAuth('tenant cache hit', { tenantId: cached.tenant_id, rol: cached.rol });
      }

      const resolved = await resolveTenantUserForSession(u);
      if (resolved) {
        setTenantUser(rowToTenantUser(resolved));
        writeTenantSessionCache(u.id, resolved);
        logAuth('tenant resolved from backend', { tenantId: resolved.tenant_id, rol: resolved.rol });
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      if (!silent) setLoading(false);
      logAuth('loadUserData:end', { silent });
    }
  }, []);

  useEffect(() => {
    logAuth('mount: initial auth load');
    void loadUserData({ silent: false });
  }, []);

  useEffect(() => {
    const doRefresh = async () => {
      const currentUser = userRef.current;
      logAuth('focus/visibility refresh triggered', {
        hasUser: Boolean(currentUser),
        isInsforgeEnvConfigured,
      });

      if (!currentUser || !isInsforgeEnvConfigured) {
        await loadUserData({ silent: true });
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
        const storedToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (!storedToken) {
          logAuth('refreshSession:no-token-stored -> skip');
          await loadUserData({ silent: true });
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
            clearSession();
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
          setUser(refreshedUser);
          logAuth('refreshSession:ok -> user updated from payload', {
            userId: refreshedUser.id,
          });
        }

        refreshBlockedUntil = 0;
        return 'ok';
      })();

      const result = await refreshInFlight;
      refreshInFlight = null;

      if (result === 'ok') {
        await loadUserData({ silent: true });
      }
    };

    const onFocus = () => void doRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void doRefresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    logAuth('listeners attached', { events: ['focus', 'visibilitychange'] });

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      logAuth('listeners detached');
    };
  }, [loadUserData, clearSession]);

  const signOut = async () => {
    logAuth('signOut:start');
    const { error } = await insforgeClient.auth.signOut();
    if (error) console.error('Error signing out:', error);
    clearSession();
    logAuth('signOut:done');
  };

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
    refreshSession: (opts?: { showLoading?: boolean }) =>
      void loadUserData({ silent: opts?.showLoading !== true }),
  };
}
