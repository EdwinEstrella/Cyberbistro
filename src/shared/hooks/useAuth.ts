import { useState, useEffect, useCallback } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from '../lib/insforge';

interface TenantUser {
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string;
}

async function fetchTenantUser(authUserId: string) {
  return insforgeClient.database
    .from('tenant_users')
    .select('tenant_id, email, rol, nombre')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
}

/** Reintentos solo si hay error de red/API; si no hay fila en BD, no insiste. */
async function fetchTenantUserWithRetry(authUserId: string) {
  const maxAttempts = 4;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }
    const { data, error } = await fetchTenantUser(authUserId);
    if (!error && data) {
      return { data, error: null as null };
    }
    if (!error && !data) {
      return { data: null, error: null as null };
    }
    lastError = error;
  }
  console.warn('useAuth: tenant_users no respondió tras reintentos', lastError);
  return { data: null, error: lastError };
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

      const { data: tenantUserData } = await fetchTenantUserWithRetry(u.id);

      if (tenantUserData) {
        setTenantUser(tenantUserData);
      } else {
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
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadUserData({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadUserData]);

  useEffect(() => {
    const id = window.setInterval(
      () => {
        void loadUserData({ silent: true });
      },
      4 * 60 * 1000
    );
    return () => window.clearInterval(id);
  }, [loadUserData]);

  const signOut = async () => {
    const { error } = await insforgeClient.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    setUser(null);
    setTenantUser(null);
  };

  return {
    user,
    tenantUser,
    tenantId: tenantUser?.tenant_id || null,
    rol: tenantUser?.rol || null,
    loading,
    signOut,
    isAuthenticated: !!user,
    refreshSession: (opts?: { showLoading?: boolean }) =>
      void loadUserData({ silent: opts?.showLoading !== true }),
  };
}
