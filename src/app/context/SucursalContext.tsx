import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useAuth } from "../../shared/hooks/useAuth";
import { readLocalMirror, isLocalFirstEnabled, enqueueLocalWrite, getDeviceId } from "../../shared/lib/localFirst";
import { insforgeClient } from "../../shared/lib/insforge";

export interface Sucursal {
  id: string;
  tenant_id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  activa: boolean;
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

export function SucursalProvider({ children }: { children: ReactNode }) {
  const { tenantId, isAuthenticated } = useAuth();
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [activeSucursalId, setActiveSucursalIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Custom setter that saves to localStorage
  function setActiveSucursalId(id: string | null) {
    setActiveSucursalIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function refreshSucursales() {
    if (!tenantId || !isAuthenticated) {
      setSucursales([]);
      setActiveSucursalIdState(null);
      setLoading(false);
      return;
    }

    try {
      let data: any[] = [];
      const useLocal = isLocalFirstEnabled();

      if (useLocal) {
        data = await readLocalMirror<any>(tenantId, "sucursales");
      } else {
        const res = await insforgeClient.database
          .from("sucursales")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("activa", true);
        data = res.data || [];
      }

      const activeList = data.filter((s) => s.activa !== false) as Sucursal[];
      setSucursales(activeList);

      // Resolve active sucursal ID
      const savedId = localStorage.getItem(STORAGE_KEY);
      const isSavedValid = savedId && activeList.some((s) => s.id === savedId);

      if (isSavedValid) {
        setActiveSucursalIdState(savedId);
      } else if (activeList.length > 0) {
        // Default to the first sucursal
        const defaultId = activeList[0].id;
        setActiveSucursalIdState(defaultId);
        localStorage.setItem(STORAGE_KEY, defaultId);
      } else {
        setActiveSucursalIdState(null);
      }
    } catch (err) {
      console.error("Error loading sucursales in context:", err);
    } finally {
      setLoading(false);
    }
  }

  async function addSucursal(nombre: string, direccion?: string, telefono?: string): Promise<Sucursal> {
    if (!tenantId || !isAuthenticated) {
      throw new Error("Usuario no autenticado");
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
      const useLocal = isLocalFirstEnabled();
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
    void refreshSucursales();
  }, [tenantId, isAuthenticated]);

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
