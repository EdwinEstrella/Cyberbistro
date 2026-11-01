import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { RefreshCw, LogOut, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { TitleBar } from "../../window";
import { useAuth } from "../../../shared/hooks/useAuth";
import { supabase } from "../../../shared/lib/supabase";
import { type Plan } from "../../../shared/lib/planFeatures";
import { fetchIsSuperAdmin } from "../../../shared/lib/superAdmin";
import {
  countActiveUsersByRole,
  tenantUserLimitColumnsPresent,
} from "../../../shared/lib/tenantUserLimits";
import { ConfirmModal } from "../../../shared/components/ConfirmModal";
import { Button } from "../../../shared/ui/button";
import { Input } from "../../../shared/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../shared/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../../shared/ui/sheet";

import type {
  TenantRow,
  TenantUserRow,
  SuperAdminAuditLogRow,
  TenantCard,
  LimitDraft,
  TenantFilterState,
} from "../lib/types";
import { computeSuperAdminKpis } from "../lib/kpi";
import { toDraft, parseNullableLimit, parseNullablePositiveLimit, parsePaymentDay } from "../lib/dirtyDetection";
import { KpiStrip } from "./KpiStrip";
import { TenantList } from "./TenantList";
import { TenantDetailHeader } from "./TenantDetailHeader";
import { PlanSelector } from "./PlanSelector";
import { LimitsForm } from "./LimitsForm";
import { PaymentsForm } from "./PaymentsForm";
import { UsersTab } from "./UsersTab";
import { AuditTab } from "./AuditTab";
import { TenantOverviewPanel } from "./TenantOverviewPanel";
import "../super-admin.css";

const MOBILE_QUERY = "(max-width: 767px)";

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false;
}

export function SuperAdminPage() {
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated, signOut } = useAuth();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  // Super admin font scope for portals and global text
  useEffect(() => {
    document.body.classList.add("super-admin-active");
    return () => {
      document.body.classList.remove("super-admin-active");
    };
  }, []);

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [columnsReady, setColumnsReady] = useState(true);

  const [drafts, setDrafts] = useState<Record<string, LimitDraft>>({});
  const [initialDrafts, setInitialDrafts] = useState<Record<string, LimitDraft>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  // Mobile detail drawer state (< 768px)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Close the phone drawer when the window grows to the master-detail layout.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileDetailOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Active detail tab
  const [activeTab, setActiveTab] = useState<"resumen" | "usuarios" | "plan-limites" | "pagos" | "auditoria">("resumen");

  // Filters state
  const [filterState, setFilterState] = useState<TenantFilterState>({
    search: "",
    status: "all",
    plan: "all",
  });

  const [savingTenantId, setSavingTenantId] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<SuperAdminAuditLogRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Confirmation modal state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "primary";
  }>({
    open: false,
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    title = "Confirmar",
    variant: "danger" | "primary" = "danger"
  ) => {
    setConfirmState({ open: true, message, onConfirm, title, variant });
  };

  async function loadAuditLogs() {
    setLoadingAudit(true);
    try {
      const { data, error: auditError } = await supabase
        .from("superadmin_audit_log")
        .select("id, actor_auth_user_id, action, tenant_id, target_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!auditError && data) {
        setAuditLogs(data as SuperAdminAuditLogRow[]);
      }
    } catch (err) {
      console.warn("loadAuditLogs failed", err);
    } finally {
      setLoadingAudit(false);
    }
  }

  // Security gate: fetchIsSuperAdmin (fail-closed)
  useEffect(() => {
    let mounted = true;
    async function checkSuperAdmin() {
      if (authLoading) return;
      if (!isAuthenticated) {
        setCheckingAccess(false);
        setIsAllowed(false);
        return;
      }
      setCheckingAccess(true);
      const allowed = await fetchIsSuperAdmin();
      if (mounted) {
        setIsAllowed(allowed);
        setCheckingAccess(false);
      }
    }
    void checkSuperAdmin();
    return () => {
      mounted = false;
    };
  }, [authLoading, isAuthenticated]);

  async function loadData() {
    void loadAuditLogs();
    setLoadingData(true);
    setError("");
    setInfo("");

    const [tenantRes, userRes] = await Promise.all([
      supabase.from("tenants").select("*"),
      supabase
        .from("tenant_users")
        .select("id, tenant_id, email, rol, nombre, activo, auth_user_id"),
    ]);

    if (tenantRes.error) {
      const msg = `No se pudo cargar la tabla tenants: ${tenantRes.error.message}`;
      setError(msg);
      toast.error(msg);
      setLoadingData(false);
      return;
    }

    if (userRes.error) {
      const msg = `No se pudo cargar la tabla tenant_users: ${userRes.error.message}`;
      setError(msg);
      toast.error(msg);
      setLoadingData(false);
      return;
    }

    const tenantRows = ((tenantRes.data ?? []) as TenantRow[]).sort((a, b) =>
      `${a.nombre_negocio ?? ""}`.localeCompare(`${b.nombre_negocio ?? ""}`)
    );
    const userRows = ((userRes.data ?? []) as TenantUserRow[]).sort((a, b) =>
      `${a.tenant_id}-${a.email}`.localeCompare(`${b.tenant_id}-${b.email}`)
    );

    const nextDrafts: Record<string, LimitDraft> = {};
    const nextInitials: Record<string, LimitDraft> = {};
    tenantRows.forEach((tenant) => {
      const d = toDraft(tenant);
      nextDrafts[tenant.id] = { ...d };
      nextInitials[tenant.id] = { ...d };
    });

    setColumnsReady(
      tenantRows.length === 0 || tenantRows.some((row) => tenantUserLimitColumnsPresent(row))
    );
    setTenants(tenantRows);
    setTenantUsers(userRows);
    setDrafts(nextDrafts);
    setInitialDrafts(nextInitials);

    setSelectedTenantId((current) => {
      if (tenantRows.length === 0) return null;
      if (current && tenantRows.some((row) => row.id === current)) return current;
      return tenantRows[0].id;
    });

    if (tenantRows.length === 0) {
      setInfo(
        "La consulta no devolvió restaurantes. Si hay datos en la base, verifica la política RLS de super admin."
      );
    }

    setLoadingData(false);
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated && !checkingAccess && isAllowed) {
      void loadData();
    }
  }, [authLoading, isAuthenticated, checkingAccess, isAllowed]);

  const tenantCards = useMemo<TenantCard[]>(() => {
    const usersByTenant = new Map<string, TenantUserRow[]>();
    tenantUsers.forEach((row) => {
      const bucket = usersByTenant.get(row.tenant_id) ?? [];
      bucket.push(row);
      usersByTenant.set(row.tenant_id, bucket);
    });

    return tenants.map((tenant) => {
      const users = usersByTenant.get(tenant.id) ?? [];
      return {
        tenant,
        users,
        admins: users.filter((row) => row.rol === "admin" && row.activo !== false),
        counts: {
          admin: countActiveUsersByRole(users, "admin"),
          cajera: countActiveUsersByRole(users, "cajera"),
          cocina: countActiveUsersByRole(users, "cocina"),
          mesero: countActiveUsersByRole(users, "mesero"),
        },
      };
    });
  }, [tenantUsers, tenants]);

  const kpis = useMemo(() => computeSuperAdminKpis(tenants), [tenants]);

  const selectedTenantCard = useMemo(
    () => tenantCards.find(({ tenant }) => tenant.id === selectedTenantId) ?? tenantCards[0] ?? null,
    [selectedTenantId, tenantCards]
  );

  const selectedDraft = selectedTenantCard ? drafts[selectedTenantCard.tenant.id] ?? toDraft(selectedTenantCard.tenant) : null;
  const selectedInitialDraft = selectedTenantCard ? initialDrafts[selectedTenantCard.tenant.id] ?? toDraft(selectedTenantCard.tenant) : null;

  // Handlers for tenant operations
  async function saveLimits(tenantId: string) {
    const draft = drafts[tenantId];
    if (!draft) return;

    try {
      setSavingTenantId(tenantId);
      setError("");

      const payload = {
        user_limit_enabled: draft.userLimitEnabled,
        admin_user_limit: 1,
        cajera_user_limit: parseNullableLimit(draft.cajeraUserLimit),
        cocina_user_limit: parseNullableLimit(draft.cocinaUserLimit),
        mesero_user_limit: parseNullableLimit(draft.meseroUserLimit),
        sucursal_limit_enabled: draft.sucursalLimitEnabled,
        sucursal_limit: parseNullablePositiveLimit(draft.sucursalLimit),
        payment_day_of_month: parsePaymentDay(draft.paymentDayOfMonth),
      };

      const { error: updateError } = await supabase
        .from("tenants")
        .update(payload)
        .eq("id", tenantId);

      if (updateError) {
        const msg = `No se pudieron guardar los límites: ${updateError.message}`;
        setError(msg);
        toast.error(msg);
        setSavingTenantId(null);
        return;
      }

      toast.success("Límites del restaurante actualizados con éxito.");
      await loadData();
      setSavingTenantId(null);
    } catch (err) {
      setSavingTenantId(null);
      const msg = err instanceof Error ? err.message : "Error al guardar los límites.";
      setError(msg);
      toast.error(msg);
    }
  }

  function updateTenantPlan(tenantId: string, plan: Plan) {
    let confirmMsg = `¿Cambiar el plan del restaurante a ${plan.toUpperCase()}?\n\n`;
    if (plan === "basico") {
      confirmMsg +=
        "Si se degrada a Básico, se ocultarán los módulos de inventario y sucursales (límite de 1 sucursal y 3 usuarios + admin).";
    } else if (plan === "profesional") {
      confirmMsg +=
        "Se habilitará el inventario avanzado, facturación electrónica (e-CF) y el soporte de hasta 2 sucursales con 5 usuarios (+ admin).";
    } else if (plan === "empresarial") {
      confirmMsg +=
        "Se habilitará el soporte para sucursales ilimitadas, usuarios ilimitados y enlaces de menú público.";
    } else {
      confirmMsg +=
        "Se habilitará el plan Corporativo con factura consolidada quincenal/mensual, nómina de empleados, límite de crédito corporativo y hasta 6 enlaces de menú.";
    }

    showConfirm(
      confirmMsg,
      async () => {
        try {
          setSavingPlanId(tenantId);
          setError("");

          const { error: updateError } = await supabase
            .from("tenants")
            .update({ plan })
            .eq("id", tenantId);

          if (updateError) {
            const msg = `No se pudo actualizar el plan: ${updateError.message}`;
            setError(msg);
            toast.error(msg);
            setSavingPlanId(null);
            return;
          }

          toast.success(`Plan del restaurante actualizado a ${plan.toUpperCase()} correctamente.`);
          await loadData();
          setSavingPlanId(null);
        } catch (err) {
          setSavingPlanId(null);
          const msg = err instanceof Error ? err.message : "No se pudo actualizar el plan.";
          setError(msg);
          toast.error(msg);
        }
      },
      "Actualizar Plan",
      "primary"
    );
  }

  function deleteTenantUser(row: TenantUserRow) {
    if (row.rol === "admin") {
      const msg = "El admin dueño no se elimina individualmente. Bloquea o elimina el restaurante completo.";
      setError(msg);
      toast.error(msg);
      return;
    }

    showConfirm(
      `Eliminar usuario ${row.email}?\n\nEsto elimina su acceso al restaurante, borra su cuenta de Auth si esta vinculada y limpia referencias operativas asociadas a ese usuario.`,
      async () => {
        setRowActionId(row.id);
        setError("");

        const { error: rpcError } = await supabase.rpc(
          "cloudix_super_admin_delete_tenant_user",
          { p_tenant_user_id: row.id }
        );

        setRowActionId(null);

        if (rpcError) {
          const msg = `No se pudo eliminar el usuario: ${rpcError.message}`;
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success(`Usuario ${row.email} eliminado.`);
        await loadData();
      },
      "Eliminar Usuario"
    );
  }

  function blockTenant(tenant: TenantRow) {
    showConfirm(
      `Bloquear restaurante "${tenant.nombre_negocio || tenant.id}"?\n\nEsto suspende temporalmente el restaurante sin cambiar el estado individual de sus usuarios ni borrar facturas o historial.`,
      async () => {
        setRowActionId(`tenant:${tenant.id}`);
        setError("");

        const { error: rpcError } = await supabase.rpc(
          "cloudix_super_admin_block_tenant",
          { p_tenant_id: tenant.id }
        );

        setRowActionId(null);

        if (rpcError) {
          const msg = `No se pudo bloquear el restaurante: ${rpcError.message}`;
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success(`Restaurante ${tenant.nombre_negocio || tenant.id} bloqueado.`);
        await loadData();
      },
      "Bloquear Restaurante"
    );
  }

  function unblockTenant(tenant: TenantRow) {
    showConfirm(
      `Desbloquear restaurante "${tenant.nombre_negocio || tenant.id}"?\n\nEsto vuelve a habilitar el restaurante. Los usuarios eliminados o inactivos no recuperan acceso automáticamente.`,
      async () => {
        setRowActionId(`tenant:${tenant.id}`);
        setError("");

        const { error: rpcError } = await supabase.rpc(
          "cloudix_super_admin_unblock_tenant",
          { p_tenant_id: tenant.id }
        );

        setRowActionId(null);

        if (rpcError) {
          const msg = `No se pudo desbloquear el restaurante: ${rpcError.message}`;
          setError(msg);
          toast.error(msg);
          return;
        }

        toast.success(`Restaurante ${tenant.nombre_negocio || tenant.id} desbloqueado.`);
        await loadData();
      },
      "Desbloquear Restaurante",
      "primary"
    );
  }

  function deleteTenant(tenant: TenantRow) {
    showConfirm(
      `Eliminar definitivamente restaurante "${tenant.nombre_negocio || tenant.id}"?\n\nEsto elimina el restaurante, todos sus usuarios, cuentas Auth vinculadas, carta, comandas, consumos, facturas, mesas, cocina y cierres. Esta acción no se puede deshacer.`,
      () => {
        setTimeout(() => {
          showConfirm(
            `Confirmación final: eliminar TODO lo relacionado con "${tenant.nombre_negocio || tenant.id}".`,
            async () => {
              setRowActionId(`delete-tenant:${tenant.id}`);
              setError("");

              const { error: rpcError } = await supabase.rpc(
                "cloudix_super_admin_delete_tenant",
                { p_tenant_id: tenant.id }
              );

              setRowActionId(null);

              if (rpcError) {
                const msg = `No se pudo eliminar el restaurante: ${rpcError.message}`;
                setError(msg);
                toast.error(msg);
                return;
              }

              toast.success(`Restaurante ${tenant.nombre_negocio || tenant.id} eliminado.`);
              setSelectedTenantId(null);
              setMobileDetailOpen(false);
              await loadData();
            },
            "Confirmación Final",
            "danger"
          );
        }, 350);
      },
      "Eliminar Restaurante"
    );
  }

  const handleSelectTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    // The bottom drawer is only for phones; on md+ the detail pane is already visible.
    setMobileDetailOpen(isMobileViewport());
  };

  if (authLoading || checkingAccess) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Verificando permisos de superadministrador...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  const detailContent = selectedTenantCard && selectedDraft && selectedInitialDraft ? (
    <div className="flex flex-col gap-6">
      <TenantDetailHeader
        card={selectedTenantCard}
        onBlockTenant={() => blockTenant(selectedTenantCard.tenant)}
        onUnblockTenant={() => unblockTenant(selectedTenantCard.tenant)}
        onDeleteTenant={() => deleteTenant(selectedTenantCard.tenant)}
        rowActionId={rowActionId}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)}>
        <div className="relative w-full">
          <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] pb-1 snap-x">
            <TabsList className="inline-flex w-auto min-w-full justify-start gap-1.5 h-10 p-1 bg-[#1a1a1a] border border-[rgba(72,72,71,0.18)] rounded-[10px]">
              <TabsTrigger value="resumen" className="text-xs shrink-0 snap-start px-3.5 whitespace-nowrap cursor-pointer rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)]">
                Resumen
              </TabsTrigger>
              <TabsTrigger value="usuarios" className="text-xs shrink-0 snap-start px-3.5 whitespace-nowrap cursor-pointer rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)]">
                Usuarios ({selectedTenantCard.users.length})
              </TabsTrigger>
              <TabsTrigger value="plan-limites" className="text-xs shrink-0 snap-start px-3.5 whitespace-nowrap cursor-pointer rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)]">
                Plan y límites
              </TabsTrigger>
              <TabsTrigger value="pagos" className="text-xs shrink-0 snap-start px-3.5 whitespace-nowrap cursor-pointer rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)]">
                Pagos
              </TabsTrigger>
              <TabsTrigger value="auditoria" className="text-xs shrink-0 snap-start px-3.5 whitespace-nowrap cursor-pointer rounded-[8px] font-['Space_Grotesk',sans-serif] font-bold uppercase tracking-[0.5px] text-[#adaaaa] data-[state=active]:bg-[rgba(255,144,109,0.12)] data-[state=active]:border-[#ff906d] data-[state=active]:text-[#ff906d] data-[state=active]:shadow-[0_0_12px_rgba(255,144,109,0.1)]">
                Auditoría
              </TabsTrigger>
            </TabsList>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[#0c0c0c] via-[#0c0c0c]/60 to-transparent xl:hidden"
          />
        </div>

        <div className="mt-4">
          <TabsContent value="resumen" className="outline-none">
            <TenantOverviewPanel
              card={selectedTenantCard}
              embedded={true}
            />
          </TabsContent>

          <TabsContent value="usuarios" className="outline-none">
            <UsersTab
              users={selectedTenantCard.users}
              onDeleteUser={deleteTenantUser}
              rowActionId={rowActionId}
            />
          </TabsContent>

          <TabsContent value="plan-limites" className="outline-none space-y-6">
            <PlanSelector
              currentPlan={selectedTenantCard.tenant.plan}
              savingPlanId={savingPlanId}
              tenantId={selectedTenantCard.tenant.id}
              onSelectPlan={(plan) => updateTenantPlan(selectedTenantCard.tenant.id, plan)}
            />

            <LimitsForm
              draft={selectedDraft}
              initialDraft={selectedInitialDraft}
              saving={savingTenantId === selectedTenantCard.tenant.id}
              onChange={(updated) =>
                setDrafts((prev) => ({ ...prev, [selectedTenantCard.tenant.id]: updated }))
              }
              onSave={() => void saveLimits(selectedTenantCard.tenant.id)}
              onReset={() =>
                setDrafts((prev) => ({
                  ...prev,
                  [selectedTenantCard.tenant.id]: { ...selectedInitialDraft },
                }))
              }
            />
          </TabsContent>

          <TabsContent value="pagos" className="outline-none">
            <PaymentsForm
              draft={selectedDraft}
              initialDraft={selectedInitialDraft}
              saving={savingTenantId === selectedTenantCard.tenant.id}
              onChange={(updated) =>
                setDrafts((prev) => ({ ...prev, [selectedTenantCard.tenant.id]: updated }))
              }
              onSave={() => void saveLimits(selectedTenantCard.tenant.id)}
              onReset={() =>
                setDrafts((prev) => ({
                  ...prev,
                  [selectedTenantCard.tenant.id]: { ...selectedInitialDraft },
                }))
              }
            />
          </TabsContent>

          <TabsContent value="auditoria" className="outline-none">
            <AuditTab
              logs={auditLogs}
              tenants={tenants}
              selectedTenantId={selectedTenantCard.tenant.id}
              loading={loadingAudit}
              onRefresh={() => void loadAuditLogs()}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  ) : (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-[rgba(72,72,71,0.3)] p-12 text-center bg-[#131313]">
      <Store className="h-8 w-8 text-[#adaaaa]" />
      <h4 className="font-['Space_Grotesk',sans-serif] font-bold text-sm text-white">Ningún restaurante seleccionado</h4>
      <p className="max-w-sm text-xs text-[#adaaaa]">
        Selecciona un restaurante de la lista lateral para visualizar sus métricas, usuarios y configuración.
      </p>
    </div>
  );

  return (
    <div className="super-admin-scope flex h-screen min-h-0 w-full flex-col overflow-hidden bg-[#0c0c0c] text-white antialiased">
      <TitleBar />

      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1520px] flex-col gap-6">
          {/* Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-5 shadow-sm">
            <div className="space-y-1">
              <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-2xl uppercase tracking-[0.5px] text-white">
                Administración
              </h1>
              <p className="font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.5px] text-[#adaaaa]">
                Restaurantes, planes y soporte
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64 sm:w-80">
                <Input
                  type="text"
                  placeholder="Buscar restaurante, RNC o email..."
                  value={filterState.search}
                  onChange={(e) => setFilterState((p) => ({ ...p, search: e.target.value }))}
                  className="h-9 pl-9 text-xs rounded-[10px] bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] text-white placeholder:text-[#adaaaa] focus:border-[#ff906d]/50"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#adaaaa] pointer-events-none" />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadData()}
                disabled={loadingData}
                className="h-9 gap-1.5 text-xs rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
                <span>Recargar</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate("/", { replace: true });
                }}
                className="h-9 gap-1.5 text-xs font-medium rounded-[10px] border border-[rgba(72,72,71,0.3)] text-[#adaaaa] hover:border-white hover:text-white bg-transparent cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Cerrar sesión</span>
              </Button>
            </div>
          </div>

          {/* Feedback banners if any */}
          {error && (
            <div className="rounded-[12px] border border-[rgba(255,113,108,0.3)] bg-[rgba(255,113,108,0.1)] px-4 py-3 text-xs text-[#ff716c]">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-[12px] border border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.1)] px-4 py-3 text-xs text-blue-400">
              {info}
            </div>
          )}
          {!columnsReady && (
            <div className="rounded-[12px] border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)] px-4 py-3 text-xs text-amber-400">
              La UI de límites está lista, pero este backend todavía no expone las columnas de cuotas en tenants.
            </div>
          )}

          {/* KPI Strip */}
          <KpiStrip kpis={kpis} loading={loadingData} />

          {/* Master-Detail Layout */}
          {loadingData ? (
            <div className="flex h-64 items-center justify-center rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313]">
              <RefreshCw className="h-6 w-6 animate-spin text-[#ff906d]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
              {/* Left Pane: Restaurant List */}
              <aside className="rounded-[16px] border border-[rgba(72,72,71,0.18)] bg-[#131313] p-4 md:sticky md:top-0 h-auto md:max-h-[calc(100vh-220px)] flex flex-col">
                <TenantList
                  cards={tenantCards}
                  selectedTenantId={selectedTenantId}
                  onSelectTenant={handleSelectTenant}
                  filterState={filterState}
                  onFilterChange={(update) => setFilterState((p) => ({ ...p, ...update }))}
                  loading={loadingData}
                />
              </aside>

              {/* Right Pane: Restaurant Detail (Desktop) */}
              <section className="hidden md:block min-w-0">
                {detailContent}
              </section>

              {/* Mobile Detail Drawer (< 768px) */}
              <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
                <SheetContent
                  side="bottom"
                  className="super-admin-scope h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-t-[16px] bg-[#131313] border-t border-[rgba(72,72,71,0.18)] text-white"
                >
                  <SheetHeader className="pb-2">
                    <SheetTitle className="font-['Space_Grotesk',sans-serif] font-bold text-base text-white uppercase tracking-[0.5px]">
                      Detalle del restaurante
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-2">
                    {detailContent}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Modal */}
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title ?? "Confirmar"}
        message={confirmState.message}
        onConfirm={() => {
          confirmState.onConfirm();
          setConfirmState((s) => ({ ...s, open: false }));
        }}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
        variant={confirmState.variant}
      />
    </div>
  );
}
