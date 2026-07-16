import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "../../shared/hooks/useAuth";
import { readLocalMirror, shouldReadLocalFirst, enqueueLocalWrite, getDeviceId } from "../../shared/lib/localFirst";
import { insforgeClient } from "../../shared/lib/insforge";
import { canCommitTenantAsyncState } from "../../shared/lib/tenantAccessGuard";

export interface Sucursal {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
}

interface TenantSucursalLimitRow {
  id?: string;
  plan?: string | null;
  sucursal_limit_enabled?: boolean | null;
  sucursal_limit?: number | null;
}

export type SucursalContextValue = {
  activeSucursalId: string | null;
  setActiveSucursalId: (id: string | null) => void;
  sucursales: Sucursal[];
  loading: boolean;
  refreshSucursales: () => Promise<void>;
  addSucursal: (nombre: string, direccion?: string, telefono?: string) => Promise<Sucursal>;
  deleteSucursal: (id: string) => Promise<{ success: boolean; error?: string }>;
};

const SucursalContext = createContext<SucursalContextValue | null>(null);

const STORAGE_KEY = "cloudix_active_sucursal_id";
const scopedStorageKey = (tenantId: string) => `${STORAGE_KEY}:${tenantId}`;

function defaultSucursalLimitForPlan(plan?: string | null): number | null {
  switch ((plan || "basico").trim().toLowerCase()) {
    case "basico":
      return 1;
    case "profesional":
      return 3;
    case "empresarial":
      return null;
    default:
      return 1;
  }
}

function resolveEffectiveSucursalLimit(
  tenant: TenantSucursalLimitRow | null | undefined,
  fallbackPlan?: string | null
): number | null {
  if (tenant?.sucursal_limit_enabled === false) return null;
  if (typeof tenant?.sucursal_limit === "number" && Number.isFinite(tenant.sucursal_limit)) {
    return tenant.sucursal_limit;
  }
  return defaultSucursalLimitForPlan(tenant?.plan ?? fallbackPlan);
}

export function SucursalProvider({ children }: { children: ReactNode }) {
  const { tenantId, isAuthenticated, plan, tenantAccessValidated } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [activeSucursalId, setActiveSucursalIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const accessGeneration = useRef(0);

  function isCurrentAccess(generation: number, expectedTenantId: string): boolean {
    return canCommitTenantAsyncState({
      requestGeneration: generation,
      currentGeneration: accessGeneration.current,
      requestTenantId: expectedTenantId,
      currentTenantId: tenantId,
      accessValidated: isAuthenticated && tenantAccessValidated,
    });
  }

  // Custom setter that saves to localStorage
  function setActiveSucursalId(id: string | null) {
    setActiveSucursalIdState(id);
    if (!tenantId) return;
    const key = scopedStorageKey(tenantId);
    if (id) {
      localStorage.setItem(key, id);
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(key);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function refreshSucursales(generation = accessGeneration.current) {
    const expectedTenantId = tenantId;
    if (!expectedTenantId || !isAuthenticated || !tenantAccessValidated) {
      setSucursales([]);
      setActiveSucursalIdState(null);
      setLoading(false);
      return;
    }

    try {
      let data: any[] = [];
      const useLocal = await shouldReadLocalFirst(expectedTenantId, ["sucursales"]);
      if (!isCurrentAccess(generation, expectedTenantId)) return;

      if (useLocal) {
        data = await readLocalMirror<any>(expectedTenantId, "sucursales").catch(() => []);
        if (!isCurrentAccess(generation, expectedTenantId)) return;
        if (data.length === 0 && navigator.onLine) {
          try {
            const res = await insforgeClient.database
              .from("sucursales")
              .select("*")
              .eq("tenant_id", expectedTenantId)
              .eq("activa", true);
            if (res.error) console.warn("Fallback to online sucursales error:", res.error);
            if (res.data && res.data.length > 0) data = res.data;
          } catch (e) {
            console.warn("Fallback to online sucursales failed", e);
          }
          if (!isCurrentAccess(generation, expectedTenantId)) return;
        }
      } else {
        const res = await insforgeClient.database
          .from("sucursales")
          .select("*")
          .eq("tenant_id", expectedTenantId)
          .eq("activa", true);
        if (res.error) console.warn("Online sucursales error:", res.error);
        data = res.data || [];
        if (!isCurrentAccess(generation, expectedTenantId)) return;
        if (data.length === 0) {
          data = await readLocalMirror<any>(expectedTenantId, "sucursales").catch(() => []);
          if (!isCurrentAccess(generation, expectedTenantId)) return;
        }
      }

      const activeList = data.filter((s) => s.activa !== false) as Sucursal[];
      if (!isCurrentAccess(generation, expectedTenantId)) return;
      setSucursales(activeList);

      const savedId = localStorage.getItem(scopedStorageKey(expectedTenantId));
      const isSavedValid = savedId && activeList.some((s) => s.id === savedId);
      if (isSavedValid) {
        if (!isCurrentAccess(generation, expectedTenantId)) return;
        setActiveSucursalIdState(savedId);
      } else if (activeList.length > 0) {
        const defaultId = activeList[0].id;
        if (!isCurrentAccess(generation, expectedTenantId)) return;
        setActiveSucursalIdState(defaultId);
        localStorage.setItem(scopedStorageKey(expectedTenantId), defaultId);
        localStorage.setItem(STORAGE_KEY, defaultId);
      } else {
        if (!isCurrentAccess(generation, expectedTenantId)) return;
        setActiveSucursalIdState(null);
      }
    } catch (err) {
      if (isCurrentAccess(generation, expectedTenantId)) console.error("Error loading sucursales in context:", err);
    } finally {
      if (isCurrentAccess(generation, expectedTenantId)) setLoading(false);
    }
  }

  async function loadTenantSucursalLimit(): Promise<TenantSucursalLimitRow | null> {
    if (!tenantId) return null;

    if (navigator.onLine) {
      try {
        const res = await insforgeClient.database
          .from("tenants")
          .select("id, plan, sucursal_limit_enabled, sucursal_limit")
          .eq("id", tenantId)
          .maybeSingle();
        if (!res.error && res.data) return res.data as TenantSucursalLimitRow;
      } catch {
        // Fallback to local mirror below.
      }
    }

    const tenants = await readLocalMirror<TenantSucursalLimitRow>(tenantId, "tenants").catch(() => []);
    return tenants.find((tenant) => tenant.id === tenantId) ?? null;
  }

  async function loadActiveSucursalCount(): Promise<number> {
    if (!tenantId) return sucursales.filter((s) => s.activa !== false).length;

    if (navigator.onLine) {
      try {
        const res = await insforgeClient.database
          .from("sucursales")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("activa", true);
        if (!res.error && typeof res.count === "number") return res.count;
      } catch {
        // Fallback to local state below.
      }
    }

    return sucursales.filter((s) => s.activa !== false).length;
  }

  async function addSucursal(nombre: string, direccion?: string, telefono?: string): Promise<Sucursal> {
    if (!tenantId || !isAuthenticated || !tenantAccessValidated) {
      throw new Error("Usuario no autenticado");
    }

    const tenantLimitRow = await loadTenantSucursalLimit();
    const effectiveLimit = resolveEffectiveSucursalLimit(tenantLimitRow, plan);
    if (effectiveLimit !== null) {
      const activeCount = await loadActiveSucursalCount();
      if (activeCount >= effectiveLimit) {
        throw new Error(`Límite de sucursales alcanzado para este plan (${effectiveLimit}).`);
      }
    }

    const newId = crypto.randomUUID();
    const payload = {
      id: newId,
      tenant_id: tenantId,
      nombre: nombre.trim(),
      direccion: direccion?.trim() || null,
      telefono: telefono?.trim() || null,
      activa: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const deviceId = await getDeviceId();
    await enqueueLocalWrite({
      tenantId,
      tableName: "sucursales",
      rowId: newId,
      op: "insert",
      payload,
      deviceId,
    });

    await refreshSucursales();
    return payload;
  }

  async function deleteSucursal(sucursalId: string): Promise<{ success: boolean; error?: string }> {
    if (!tenantId || !isAuthenticated) {
      throw new Error("Usuario no autenticado");
    }

    if (sucursalId === activeSucursalId) {
      return { success: false, error: "No podés eliminar la sucursal activa. Cambiá a otra primero." };
    }

    if (sucursales.length <= 1) {
      return { success: false, error: "No podés eliminar la única sucursal de tu negocio." };
    }

    try {
      const useLocal = await shouldReadLocalFirst(tenantId, [
        "sucursales",
        "productos_inventario",
        "inventario_movimientos",
        "produccion_cocina",
      ]);
      let hasData = false;

      if (useLocal) {
        const { checkSucursalHasData } = await import("../../shared/lib/localFirst");
        hasData = await checkSucursalHasData(tenantId, sucursalId);
      } else {
        const tables = ["productos_inventario", "inventario_movimientos", "produccion_cocina"];
        for (const table of tables) {
          const res = await insforgeClient.database
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("sucursal_id", sucursalId);
          if (res.count && res.count > 0) {
            hasData = true;
            break;
          }
        }
      }

      if (hasData) {
        return {
          success: false,
          error: "Esta sucursal tiene datos asociados (inventario, movimientos de stock, etc.) y no se puede eliminar."
        };
      }

      const deviceId = await getDeviceId();
      const payload = {
        id: sucursalId,
        tenant_id: tenantId,
        activa: false,
        updated_at: new Date().toISOString()
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "sucursales",
        rowId: sucursalId,
        op: "update",
        payload,
        deviceId
      });

      await refreshSucursales();
      return { success: true };
    } catch (err) {
      console.error("Error deleting sucursal:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Error al eliminar la sucursal."
      };
    }
  }

  // Reload sucursales when tenant or authentication changes
  useEffect(() => {
    const generation = ++accessGeneration.current;
    if (!tenantId || !isAuthenticated || !tenantAccessValidated) {
      setSucursales([]);
      setActiveSucursalIdState(null);
      setLoading(false);
    } else {
      void refreshSucursales(generation);
    }
    return () => {
      accessGeneration.current += 1;
    };
  }, [tenantId, isAuthenticated, tenantAccessValidated]);

  return (
    <SucursalContext.Provider
      value={{
        activeSucursalId,
        setActiveSucursalId,
        sucursales,
        loading,
        refreshSucursales,
        addSucursal,
        deleteSucursal,
      }}
    >
      {children}
    </SucursalContext.Provider>
  );
}

export function useSucursal() {
  const ctx = useContext(SucursalContext);
  if (!ctx) {
    throw new Error("useSucursal debe usarse dentro de SucursalProvider");
  }
  return ctx;
}
