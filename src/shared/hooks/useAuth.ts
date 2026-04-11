import { useState, useEffect } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from '../lib/insforge';

interface TenantUser {
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string;
}

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserData() {
      try {
        // 1. Obtener usuario de Auth
        const { data: authData, error: authError } = await insforgeClient.auth.getCurrentUser();

        if (authError || !authData?.user) {
          setLoading(false);
          return;
        }

        setUser(authData.user);

        // 2. Obtener tenant_id desde tenant_users usando auth_user_id
        const { data: tenantUserData, error: tenantError } = await insforgeClient
          .database
          .from('tenant_users')
          .select('tenant_id, email, rol, nombre')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();

        if (!tenantError && tenantUserData) {
          setTenantUser(tenantUserData);
        }
      } catch (err) {
        console.error('Error loading user data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, []);

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
  };
}