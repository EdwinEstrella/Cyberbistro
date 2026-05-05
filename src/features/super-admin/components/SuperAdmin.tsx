import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { TitleBar } from "../../window";
import { useAuth } from "../../../shared/hooks/useAuth";
import { insforgeClient } from "../../../shared/lib/insforge";
import { isSuperAdminUser, SUPER_ADMIN_EMAIL } from "../../../shared/lib/superAdmin";
import {
  countActiveUsersByRole,
  extractTenantUserLimitConfig,
  formatRoleLabel,
  tenantUserLimitColumnsPresent,
  type ManagedUserRole,
  type TenantUserLimitConfig,
} from "../../../shared/lib/tenantUserLimits";

interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string;
  rol: string;
  nombre: string | null;
  activo: boolean | null;
  auth_user_id: string | null;
}

interface TenantRow {
  id: string;
  nombre_negocio?: string | null;
  rnc?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activa?: boolean | null;
  user_limit_enabled?: boolean | null;
  admin_user_limit?: number | null;
  cajera_user_limit?: number | null;
  cocina_user_limit?: number | null;
  mesero_user_limit?: number | null;
  [key: string]: unknown;
}

type LimitDraft = {
  userLimitEnabled: boolean;
  adminUserLimit: string;
  cajeraUserLimit: string;
  cocinaUserLimit: string;
  meseroUserLimit: string;
};

type LimitDraftNumberField = Exclude<keyof LimitDraft, "userLimitEnabled">;

type TenantCard = {
  tenant: TenantRow;
  users: TenantUserRow[];
  admins: TenantUserRow[];
  counts: Record<ManagedUserRole, number>;
};

const MANAGED_ROLES: ManagedUserRole[] = ["admin", "cajera", "cocina", "mesero"];

function toDraft(config: TenantUserLimitConfig): LimitDraft {
  return {
    userLimitEnabled: config.userLimitEnabled,
    adminUserLimit: "1",
    cajeraUserLimit: config.cajeraUserLimit?.toString() ?? "",
    cocinaUserLimit: config.cocinaUserLimit?.toString() ?? "",
    meseroUserLimit: config.meseroUserLimit?.toString() ?? "",
  };
}

function parseNullableLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Los limites deben ser enteros mayores o iguales a 0.");
  }
  return parsed;
}

function getDraftLimit(draft: LimitDraft, role: ManagedUserRole): string {
  if (role === "admin") return "1";
  if (role === "cajera") return draft.cajeraUserLimit;
  if (role === "cocina") return draft.cocinaUserLimit;
  return draft.meseroUserLimit;
}

function getDraftField(role: ManagedUserRole): LimitDraftNumberField {
  if (role === "admin") return "adminUserLimit";
  if (role === "cajera") return "cajeraUserLimit";
  if (role === "cocina") return "cocinaUserLimit";
  return "meseroUserLimit";
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-['Space_Grotesk',sans-serif] text-[10px] font-bold uppercase tracking-[0.8px] ${
        active
          ? "bg-[rgba(89,238,80,0.1)] text-[#59ee50]"
          : "bg-[rgba(255,113,108,0.1)] text-[#ff716c]"
      }`}
    >
      {active ? "Activo" : "Bloqueado"}
    </span>
  );
}

export function SuperAdmin() {
  const navigate = useNavigate();
  const { loading, isAuthenticated, user, signOut } = useAuth();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [drafts, setDrafts] = useState<Record<string, LimitDraft>>({});
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [savingTenantId, setSavingTenantId] = useState<string | null>(null);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [columnsReady, setColumnsReady] = useState(true);

  const isAllowed = isSuperAdminUser(user);

  async function loadData() {
    setLoadingData(true);
    setError("");
    setInfo("");

    const [tenantRes, userRes] = await Promise.all([
      insforgeClient.database.from("tenants").select("*"),
      insforgeClient.database
        .from("tenant_users")
        .select("id, tenant_id, email, rol, nombre, activo, auth_user_id"),
    ]);

    if (tenantRes.error) {
      setError(`No se pudo cargar la tabla tenants: ${tenantRes.error.message}`);
      setLoadingData(false);
      return;
    }

    if (userRes.error) {
      setError(`No se pudo cargar la tabla tenant_users: ${userRes.error.message}`);
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
    tenantRows.forEach((tenant) => {
      nextDrafts[tenant.id] = toDraft(extractTenantUserLimitConfig(tenant));
    });

    setColumnsReady(tenantRows.length === 0 || tenantRows.some((row) => tenantUserLimitColumnsPresent(row)));
    setTenants(tenantRows);
    setTenantUsers(userRows);
    setDrafts(nextDrafts);
    setSelectedTenantId((current) => {
      if (tenantRows.length === 0) return null;
      if (current && tenantRows.some((row) => row.id === current)) return current;
      return tenantRows[0].id;
    });

    if (tenantRows.length === 0) {
      setInfo(
        "La consulta no devolvio restaurantes. Si hay datos en la base, falta aplicar la politica RLS de super admin sobre tenants y tenant_users."
      );
    }

    setLoadingData(false);
  }

  useEffect(() => {
    if (!loading && isAuthenticated && isAllowed) {
      void loadData();
    }
  }, [loading, isAuthenticated, isAllowed]);

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

  const selectedTenantCard = useMemo(
    () => tenantCards.find(({ tenant }) => tenant.id === selectedTenantId) ?? tenantCards[0] ?? null,
    [selectedTenantId, tenantCards]
  );

  async function saveLimits(tenantId: string) {
    const draft = drafts[tenantId];
    if (!draft) return;

    try {
      setSavingTenantId(tenantId);
      setError("");
      setInfo("");

      const payload = {
        user_limit_enabled: draft.userLimitEnabled,
        admin_user_limit: 1,
        cajera_user_limit: parseNullableLimit(draft.cajeraUserLimit),
        cocina_user_limit: parseNullableLimit(draft.cocinaUserLimit),
        mesero_user_limit: parseNullableLimit(draft.meseroUserLimit),
      };

      const { error: updateError } = await insforgeClient.database
        .from("tenants")
        .update(payload)
        .eq("id", tenantId);

      if (updateError) {
        setError(`No se pudo guardar los limites del restaurante. ${updateError.message}`);
        setSavingTenantId(null);
        return;
      }

      setInfo("Limites actualizados.");
      await loadData();
      setSavingTenantId(null);
    } catch (err) {
      setSavingTenantId(null);
      setError(err instanceof Error ? err.message : "No se pudieron guardar los limites.");
    }
  }

  async function deleteTenantUser(row: TenantUserRow) {
    if (row.rol === "admin") {
      setError("El admin dueno no se elimina individualmente. Bloquea o elimina el restaurante completo.");
      return;
    }

    const confirmed = confirm(
      `Eliminar usuario ${row.email}?\n\nEsto elimina su acceso al restaurante, borra su cuenta de Auth si esta vinculada y limpia referencias operativas asociadas a ese usuario.`
    );
    if (!confirmed) return;

    setRowActionId(row.id);
    setError("");
    setInfo("");

    const { error: rpcError } = await insforgeClient.database.rpc(
      "cloudix_super_admin_delete_tenant_user",
      { p_tenant_user_id: row.id }
    );

    setRowActionId(null);

    if (rpcError) {
      setError(`No se pudo eliminar el usuario. ${rpcError.message}`);
      return;
    }

    setInfo(`Usuario ${row.email} eliminado.`);
    await loadData();
  }

  async function blockTenant(tenant: TenantRow) {
    const confirmed = confirm(
      `Bloquear restaurante "${tenant.nombre_negocio || tenant.id}"?\n\nEsto desactiva el restaurante, desactiva todos sus usuarios y cierra la cocina. No borra facturas ni historial.`
    );
    if (!confirmed) return;

    setRowActionId(`tenant:${tenant.id}`);
    setError("");
    setInfo("");

    const { error: rpcError } = await insforgeClient.database.rpc(
      "cloudix_super_admin_block_tenant",
      { p_tenant_id: tenant.id }
    );

    setRowActionId(null);

    if (rpcError) {
      setError(`No se pudo bloquear el restaurante. ${rpcError.message}`);
      return;
    }

    setInfo(`Restaurante ${tenant.nombre_negocio || tenant.id} bloqueado.`);
    await loadData();
  }

  async function deleteTenant(tenant: TenantRow) {
    const confirmed = confirm(
      `Eliminar definitivamente restaurante "${tenant.nombre_negocio || tenant.id}"?\n\nEsto elimina el restaurante, todos sus usuarios, cuentas Auth vinculadas, carta, comandas, consumos, facturas, mesas, cocina y cierres. Esta accion no se puede deshacer.`
    );
    if (!confirmed) return;

    const secondConfirm = confirm(
      `Confirmacion final: eliminar TODO lo relacionado con "${tenant.nombre_negocio || tenant.id}".`
    );
    if (!secondConfirm) return;

    setRowActionId(`delete-tenant:${tenant.id}`);
    setError("");
    setInfo("");

    const { error: rpcError } = await insforgeClient.database.rpc(
      "cloudix_super_admin_delete_tenant",
      { p_tenant_id: tenant.id }
    );

    setRowActionId(null);

    if (rpcError) {
      setError(`No se pudo eliminar el restaurante. ${rpcError.message}`);
      return;
    }

    setInfo(`Restaurante ${tenant.nombre_negocio || tenant.id} eliminado.`);
    setSelectedTenantId(null);
    await loadData();
  }

  function renderLimitsPanel(card: TenantCard) {
    const { tenant } = card;
    const draft = drafts[tenant.id] ?? toDraft(extractTenantUserLimitConfig(tenant));

    return (
      <div className="bg-[#111111] rounded-[16px] border border-[rgba(72,72,71,0.18)] p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] uppercase">
            Limites por rol
          </span>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px] leading-relaxed">
            Admin queda fijo en 1 porque es el dueno. Deja los demas roles vacios para ilimitado.
          </span>
        </div>

        <label className="flex items-center justify-between gap-3 bg-[#1a1a1a] rounded-[12px] px-4 py-3 border border-[rgba(72,72,71,0.18)]">
          <span className="font-['Inter',sans-serif] text-white text-[13px]">Activar control de cuotas</span>
          <input
            type="checkbox"
            checked={draft.userLimitEnabled}
            onChange={(e) =>
              setDrafts((prev) => ({
                ...prev,
                [tenant.id]: {
                  ...draft,
                  userLimitEnabled: e.target.checked,
                  adminUserLimit: "1",
                },
              }))
            }
          />
        </label>

        {MANAGED_ROLES.map((role) => {
          const field = getDraftField(role);
          return (
            <div key={role} className="flex flex-col gap-2">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] uppercase tracking-[0.8px]">
                {formatRoleLabel(role)}
              </label>
              <input
                type="number"
                min="0"
                value={role === "admin" ? "1" : draft[field]}
                disabled={role === "admin"}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [tenant.id]: {
                      ...draft,
                      adminUserLimit: "1",
                      [field]: e.target.value,
                    },
                  }))
                }
                placeholder="Ilimitado"
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-3 py-2 font-['Inter',sans-serif] text-white text-[13px] outline-none disabled:opacity-60"
              />
            </div>
          );
        })}

        <button
          type="button"
          disabled={savingTenantId === tenant.id}
          onClick={() => void saveLimits(tenant.id)}
          className="bg-[#ff906d] rounded-[12px] px-4 py-3 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase cursor-pointer border-none disabled:opacity-50"
        >
          {savingTenantId === tenant.id ? "Guardando..." : "Guardar limites"}
        </button>
      </div>
    );
  }

  function renderTenantDetail(card: TenantCard) {
    const { tenant, users, admins, counts } = card;
    const draft = drafts[tenant.id] ?? toDraft(extractTenantUserLimitConfig(tenant));
    const isBlocked = tenant.activa === false;

    return (
      <section className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.18)] p-6 flex flex-col gap-5 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[22px]">
                {tenant.nombre_negocio || "Restaurante sin nombre"}
              </span>
              <StatusPill active={!isBlocked} />
            </div>
            <div className="flex flex-wrap gap-3 text-[12px] font-['Inter',sans-serif] text-[#6b7280]">
              <span className="break-all">Tenant: {tenant.id}</span>
              <span>Admins activos: {admins.length}</span>
              <span>Total usuarios: {users.length}</span>
              {tenant.rnc ? <span>RNC: {tenant.rnc}</span> : null}
              {tenant.telefono ? <span>Tel: {tenant.telefono}</span> : null}
            </div>
            {tenant.direccion ? (
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[12px]">{tenant.direccion}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={rowActionId === `tenant:${tenant.id}` || isBlocked}
              onClick={() => void blockTenant(tenant)}
              className="bg-[rgba(255,176,32,0.12)] border border-[rgba(255,176,32,0.25)] rounded-[10px] px-3 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#ffb020] text-[10px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rowActionId === `tenant:${tenant.id}` ? "Bloqueando..." : "Bloquear restaurante"}
            </button>
            <button
              type="button"
              disabled={rowActionId === `delete-tenant:${tenant.id}`}
              onClick={() => void deleteTenant(tenant)}
              className="bg-[rgba(255,113,108,0.1)] border border-[rgba(255,113,108,0.28)] rounded-[10px] px-3 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#ff716c] text-[10px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rowActionId === `delete-tenant:${tenant.id}` ? "Eliminando..." : "Eliminar restaurante"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {MANAGED_ROLES.map((role) => {
            const limitValue = getDraftLimit(draft, role);
            return (
              <div
                key={role}
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.18)] rounded-[12px] px-3 py-2 min-w-[108px]"
              >
                <div className="font-['Inter',sans-serif] text-[#6b7280] text-[10px] uppercase tracking-[0.7px]">
                  {formatRoleLabel(role)}
                </div>
                <div className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px]">
                  {counts[role]}
                  <span className="text-[#6b7280] text-[12px] ml-1">
                    / {draft.userLimitEnabled ? limitValue || "sin limite" : "sin limite"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_380px] gap-5">
          <div className="overflow-x-auto rounded-[14px] border border-[rgba(72,72,71,0.18)]">
            <table className="w-full min-w-[740px] border-collapse">
              <thead>
                <tr className="bg-[#1a1a1a] text-left font-['Inter',sans-serif] text-[10px] uppercase tracking-[0.8px] text-[#adaaaa]">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Auth</th>
                  <th className="px-4 py-3 w-[170px]">Accion</th>
                </tr>
              </thead>
              <tbody className="font-['Inter',sans-serif] text-[13px] text-white">
                {users.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-[#6b7280]" colSpan={6}>
                      Este restaurante no tiene usuarios registrados.
                    </td>
                  </tr>
                ) : (
                  users.map((row) => (
                    <tr key={row.id} className="border-t border-[rgba(72,72,71,0.14)]">
                      <td className="px-4 py-3">{row.email}</td>
                      <td className="px-4 py-3 text-[#adaaaa]">{row.nombre || "-"}</td>
                      <td className="px-4 py-3 capitalize">
                        {row.rol === "admin" ? "admin dueno" : row.rol}
                      </td>
                      <td className="px-4 py-3">{row.activo === false ? "Inactivo" : "Activo"}</td>
                      <td className="px-4 py-3 text-[#6b7280]">{row.auth_user_id ? "Vinculado" : "Pendiente"}</td>
                      <td className="px-4 py-3">
                        {row.rol === "admin" ? (
                          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">
                            Protegido
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={rowActionId === row.id}
                            onClick={() => void deleteTenantUser(row)}
                            className="bg-[rgba(255,113,108,0.1)] border border-[rgba(255,113,108,0.25)] rounded-[8px] px-3 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#ff716c] text-[10px] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {rowActionId === row.id ? "Eliminando..." : "Eliminar usuario"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {renderLimitsPanel(card)}
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[220px]">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="bg-[#0e0e0e] flex flex-col h-screen min-h-0 w-full overflow-hidden">
      <TitleBar />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6">
        <div className="max-w-[1380px] mx-auto flex flex-col gap-6">
          <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.18)] p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[26px] uppercase">
                  Super Admin
                </span>
                <span className="font-['Inter',sans-serif] text-[#6b7280] text-[13px] max-w-[760px] leading-relaxed">
                  Vista global de restaurantes y usuarios creados en cloudix. Este acceso queda reservado al correo {SUPER_ADMIN_EMAIL}.
                </span>
                <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] break-all">
                  Auth user ID: {user?.id ?? "sin sesion"}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="bg-[#262626] border border-[rgba(72,72,71,0.35)] rounded-[12px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#adaaaa] text-[12px] uppercase cursor-pointer"
                >
                  Recargar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    navigate("/", { replace: true });
                  }}
                  className="bg-[#ff906d] rounded-[12px] px-4 py-2 font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] uppercase cursor-pointer border-none"
                >
                  Cerrar sesion
                </button>
              </div>
            </div>

            {error ? (
              <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.22)] rounded-[12px] px-4 py-3">
                <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{error}</span>
              </div>
            ) : null}

            {info ? (
              <div className="bg-[rgba(89,238,80,0.06)] border border-[rgba(89,238,80,0.22)] rounded-[12px] px-4 py-3">
                <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{info}</span>
              </div>
            ) : null}

            {!columnsReady ? (
              <div className="bg-[rgba(255,176,32,0.08)] border border-[rgba(255,176,32,0.25)] rounded-[12px] px-4 py-3">
                <span className="font-['Inter',sans-serif] text-[#ffb020] text-[13px]">
                  La UI de limites esta lista, pero este backend todavia no expone las columnas de cuotas en tenants. Ejecuta el script sql/cloudix_super_admin_limits.sql.
                </span>
              </div>
            ) : null}
          </div>

          {loadingData ? (
            <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.18)] p-8">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">Cargando restaurantes y usuarios...</span>
            </div>
          ) : tenantCards.length === 0 ? (
            <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.18)] p-8">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">No hay restaurantes registrados.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
              <aside className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.18)] p-4 lg:sticky lg:top-0">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[15px] uppercase">
                    Restaurantes
                  </span>
                  <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">{tenantCards.length}</span>
                </div>

                <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto pr-1">
                  {tenantCards.map((card) => {
                    const { tenant, users, counts } = card;
                    const selected = selectedTenantCard?.tenant.id === tenant.id;
                    return (
                      <button
                        key={tenant.id}
                        type="button"
                        onClick={() => setSelectedTenantId(tenant.id)}
                        className={`w-full rounded-[14px] border p-4 text-left transition-colors cursor-pointer ${
                          selected
                            ? "bg-[#201713] border-[rgba(255,144,109,0.45)]"
                            : "bg-[#101010] border-[rgba(72,72,71,0.16)] hover:border-[rgba(255,144,109,0.22)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-['Space_Grotesk',sans-serif] text-[14px] font-bold text-white">
                              {tenant.nombre_negocio || "Restaurante sin nombre"}
                            </div>
                            <div className="mt-1 truncate font-['Inter',sans-serif] text-[11px] text-[#6b7280]">
                              {tenant.rnc || tenant.telefono || tenant.id}
                            </div>
                          </div>
                          <StatusPill active={tenant.activa !== false} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 font-['Inter',sans-serif] text-[11px] text-[#adaaaa]">
                          <span>{users.length} usuarios</span>
                          <span>{counts.admin} admin</span>
                          <span>{counts.cajera} cajera</span>
                          <span>{counts.cocina} cocina</span>
                          <span>{counts.mesero} mesero</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {selectedTenantCard ? renderTenantDetail(selectedTenantCard) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
