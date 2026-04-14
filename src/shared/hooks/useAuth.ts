import { useState, useEffect, useCallback } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from '../lib/insforge';
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
const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function isAuthUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; message?: string; error?: string };
  if (e.statusCode === 401) return true;
  const msg = `${e.error ?? ''} ${e.message ?? ''}`.toLowerCase();
  return msg.includes('401') || msg.includes('invalid token') || msg.includes('unauthorized');
}

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(() => {
    const cached = readTenantSessionCache();
    return cached ? rowToTenantUser(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const tryAuth = async () => {
        const { data: authData, error: authError } = await insforgeClient.auth.getCurrentUser();
        if (authError || !authData?.user) return null;
        return authData.user;
      };

      let u: UserSchema | null = null;
      for (let attempt = 0; attempt < AUTH_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 280 * attempt));
        }
        u = await tryAuth();
        if (u) break;
      }

      if (!u) {
        setUser(null);
        // Si no hay usuario en este intento, mantenemos el contexto cacheado;
        // RoleGuard sigue controlando el acceso por `isAuthenticated`.
        return;
      }

      setUser(u);

      const cached = readTenantSessionCache();
      if (cached?.authUserId === u.id) {
        setTenantUser(rowToTenantUser(cached));
      }

      const resolved = await resolveTenantUserForSession(u);
      if (resolved) {
        setTenantUser(rowToTenantUser(resolved));
        writeTenantSessionCache(u.id, resolved);
      } else if (!(cached?.authUserId === u.id)) {
        setTenantUser(null);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUserData({ silent: false });
  }, [loadUserData]);

  useEffect(() => {
    const refresh = () => void loadUserData({ silent: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadUserData]);

  // Mantiene viva la sesión mientras la app Electron esté abierta.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refreshInBackground = async () => {
      const { error } = await insforgeClient.auth.refreshSession();
      if (!active) return;
      if (error) {
        if (isAuthUnauthorized(error)) {
          clearTenantSessionCache();
          setUser(null);
          setTenantUser(null);
          return;
        }
        console.warn('Refresh de sesión falló (se mantiene sesión actual):', error);
        return;
      }
      void loadUserData({ silent: true });
    };

    const id = window.setInterval(() => {
      void refreshInBackground();
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [user, loadUserData]);

  const signOut = async () => {
    const { error } = await insforgeClient.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    clearTenantSessionCache();
    setUser(null);
    setTenantUser(null);
  };

  /** Tras `signInWithPassword`, la caché ya tiene tenant + rol; no hace falta “volver a buscar” en el primer render. */
  const cachedRow = user ? readTenantSessionCache() : null;
  const cacheBelongsToUser =
    cachedRow != null && user != null && cachedRow.authUserId === user.id;
  const tenantUserEffective: TenantUser | null =
    tenantUser ?? (cacheBelongsToUser ? rowToTenantUser(cachedRow) : null);

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
