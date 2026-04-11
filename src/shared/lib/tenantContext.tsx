import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { insforgeClient } from './insforge';

interface Tenant {
  id: string;
  nombre_empresa: string;
  nombre_negocio: string | null;
  activa: boolean;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant | null) => void;
  loadingTenant: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);

  useEffect(() => {
    // Cargar tenant desde localStorage al inicio
    const savedTenantId = localStorage.getItem('currentTenantId');
    if (savedTenantId) {
      loadTenant(savedTenantId);
    } else {
      // Si no hay tenant, cargar el default
      loadTenant('00000000-0000-0000-0000-000000000001');
    }
  }, []);

  async function loadTenant(tenantId: string) {
    const { data, error } = await insforgeClient.database
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (!error && data) {
      const tenant = data as Tenant;
      setCurrentTenant(tenant);
      localStorage.setItem('currentTenantId', tenant.id);
    }
    setLoadingTenant(false);
  }

  return (
    <TenantContext.Provider value={{ currentTenant, setCurrentTenant, loadingTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

// Helper para filtrar queries por tenant automáticamente
export function withTenantFilter<T extends Record<string, any>>(
  query: any,
  tenantId: string | null
): any {
  if (!tenantId) return query;
  return query.eq('tenant_id', tenantId);
}