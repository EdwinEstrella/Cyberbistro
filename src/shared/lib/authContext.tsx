import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { insforgeClient } from './insforge';

interface TenantUser {
  id: string;
  tenant_id: string;
  email: string;
  rol: 'admin' | 'cocina' | 'cajero' | 'mesero';
  nombre: string | null;
}

interface Tenant {
  id: string;
  nombre_empresa: string;
  nombre_negocio: string | null;
  activa: boolean;
}

interface AuthContextType {
  user: TenantUser | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isCocina: boolean;
  isCajero: boolean;
  isMesero: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TenantUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar sesión desde localStorage al inicio
  useEffect(() => {
    const savedUser = localStorage.getItem('auth_user');
    const savedTenant = localStorage.getItem('auth_tenant');

    if (savedUser && savedTenant) {
      setUser(JSON.parse(savedUser));
      setTenant(JSON.parse(savedTenant));
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string): Promise<boolean> {
    setLoading(true);

    // Buscar usuario por email
    const { data: users, error: userError } = await insforgeClient.database
      .from('tenant_users')
      .select('*')
      .eq('email', email)
      .eq('activo', true)
      .limit(1);

    if (userError || !users || users.length === 0) {
      setLoading(false);
      return false;
    }

    const foundUser = users[0] as TenantUser;

    // TODO: En producción verificar password_hash real
    // Por ahora aceptamos cualquier password que no sea vacío
    if (!password || password.trim() === '') {
      setLoading(false);
      return false;
    }

    // Actualizar last_login
    await insforgeClient.database
      .from('tenant_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', foundUser.id);

    // Cargar datos del tenant
    const { data: tenantData, error: tenantError } = await insforgeClient.database
      .from('tenants')
      .select('*')
      .eq('id', foundUser.tenant_id)
      .single();

    if (tenantError || !tenantData) {
      setLoading(false);
      return false;
    }

    const foundTenant = tenantData as Tenant;

    // Guardar en estado y localStorage
    setUser(foundUser);
    setTenant(foundTenant);
    localStorage.setItem('auth_user', JSON.stringify(foundUser));
    localStorage.setItem('auth_tenant', JSON.stringify(foundTenant));

    setLoading(false);
    return true;
  }

  function logout() {
    setUser(null);
    setTenant(null);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_tenant');
  }

  const isAdmin = user?.rol === 'admin';
  const isCocina = user?.rol === 'cocina';
  const isCajero = user?.rol === 'cajero';
  const isMesero = user?.rol === 'mesero';

  return (
    <AuthContext.Provider value={{
      user,
      tenant,
      loading,
      login,
      logout,
      isAdmin,
      isCocina,
      isCajero,
      isMesero,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper para filtrar queries por tenant_id automáticamente
export function withTenantFilter(query: any, tenantId: string | null) {
  if (!tenantId) return query;
  return query.eq('tenant_id', tenantId);
}