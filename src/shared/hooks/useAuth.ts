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

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(null);
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

      let u = await tryAuth();
      if (!u) {
        await new Promise((r) => setTimeout(r, 450));
        u = await tryAuth();
      }

      if (!u) {
        setUser(null);
        setTenantUser(null);
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
