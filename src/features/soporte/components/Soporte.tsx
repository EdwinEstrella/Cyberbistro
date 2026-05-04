import { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { APP_ACCESS_PIN } from "../../../shared/lib/accessPin";
import { useTheme } from "../../../shared/context/ThemeContext";
import {
  MENU_CATEGORIES,
  MENU_CATEGORY_COLORS,
  sortCategoriesForTabs,
} from "../../../shared/lib/menuCategories";
import { loadCantidadMesas, saveCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import {
  countActiveUsersByRole,
  extractTenantUserLimitConfig,
  formatRoleLabel,
  getLimitForRole,
  type TenantUserLimitConfig,
} from "../../../shared/lib/tenantUserLimits";

const STAFF_ROLES = [
  { value: "cajera", label: "Cajera / Venta" },
  { value: "cocina", label: "Cocina" },
] as const;

interface TenantUserRow {
  id: string;
  email: string;
  rol: string;
  nombre: string | null;
  activo: boolean | null;
  auth_user_id: string | null;
}

interface TenantRow {
  id: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// PIN GATE
// ─────────────────────────────────────────────
function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  function handleDigit(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      if (next === APP_ACCESS_PIN) {
        onUnlock();
      } else {
        setShaking(true);
        setTimeout(() => { setPin(""); setShaking(false); }, 600);
      }
    }
  }

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="flex-1 flex items-center justify-center bg-background transition-colors duration-300">
      <div className="flex flex-col items-center gap-[32px]">
        <div className="flex flex-col items-center gap-[6px]">
          <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[24px] ${isDark ? "text-white" : "text-black"}`}>Soporte</span>
          <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px]">Ingresá el PIN para continuar</span>
        </div>
        <div
          className="flex gap-[14px]"
          style={{ animation: shaking ? "shake 0.5s ease" : undefined }}
        >
          <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>
          {[0,1,2,3].map((i) => (
            <div
              key={i}
              className="size-[14px] rounded-full transition-all duration-150"
              style={{
                backgroundColor: i < pin.length ? (shaking ? "#ff716c" : "#ff906d") : "var(--muted)",
                boxShadow: i < pin.length && !shaking ? "0 0 10px rgba(255,144,109,0.5)" : undefined,
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-[10px]">
          {keys.map((key, i) => {
            if (key === "") return <div key={i} />;
            const isDel = key === "⌫";
            return (
              <button
                key={i}
                onClick={() => isDel ? setPin((p) => p.slice(0,-1)) : handleDigit(key)}
                className={`w-[72px] h-[72px] rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer border transition-all active:scale-95 ${isDark ? "bg-card border-white/10 text-white" : "bg-white border-black text-black"}`}
                style={{
                  backgroundColor: isDel ? (isDark ? "rgba(255,113,108,0.1)" : "rgba(255,113,108,0.05)") : undefined,
                  color: isDel ? "#ff716c" : undefined,
                }}
              >{key}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PLATOS (CARTA) PANEL
// ─────────────────────────────────────────────
interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
}

function catColor(cat: string) {
  return MENU_CATEGORY_COLORS[cat] ?? "#adaaaa";
}

const CATEGORIAS = MENU_CATEGORIES;

type FormMode = "add" | "edit" | null;

function CartaPanel() {
  const { tenantId, loading: authLoading } = useAuth();
  const { formatMoney, currencySymbol } = useTenantCurrency();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [form, setForm] = useState({ nombre: "", precio: "", categoria: "General", disponible: true, va_a_cocina: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");

  useEffect(() => {
    if (authLoading) return;
    if (!tenantId) {
      setPlatos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    insforgeClient.database
      .from("platos")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("categoria")
      .then(({ data, error }) => {
        if (!error && data) setPlatos(data as Plato[]);
        setLoading(false);
      });
  }, [tenantId, authLoading]);

  const selected = platos.find((p) => p.id === selectedId) ?? null;
  const categories = ["Todos", ...sortCategoriesForTabs(platos.map((p) => p.categoria))];
  const filtered = activeFilter === "Todos" ? platos : platos.filter((p) => p.categoria === activeFilter);

  function openAdd() {
    setForm({ nombre: "", precio: "", categoria: "General", disponible: true, va_a_cocina: true });
    setSelectedId(null);
    setMode("add");
    setError("");
  }

  function openEdit(p: Plato) {
    setSelectedId(p.id);
    setForm({ nombre: p.nombre, precio: String(p.precio), categoria: p.categoria, disponible: p.disponible, va_a_cocina: p.va_a_cocina !== false });
    setMode("edit");
    setError("");
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError("El nombre es requerido."); return; }
    const precio = parseFloat(form.precio);
    if (isNaN(precio) || precio < 0) { setError("Precio inválido."); return; }
    if (!tenantId) {
      setError("No hay restaurante asociado a la sesión.");
      return;
    }
    setSaving(true);
    setError("");

    if (mode === "add") {
      const { data, error: err } = await insforgeClient.database
        .from("platos")
        .insert([{
          nombre: form.nombre.trim(),
          precio,
          categoria: form.categoria,
          disponible: form.disponible,
          va_a_cocina: form.va_a_cocina,
          tenant_id: tenantId,
        }])
        .select();
      if (err) {
        console.error("Error al crear plato:", err);
        setError(`Error: ${err.message || "No se pudo crear el plato"}`);
        setSaving(false);
        return;
      }
      if (data) {
        setPlatos((prev) => [...prev, ...(data as Plato[])]);
        setMode(null);
        setSelectedId(null);
      }
    } else if (mode === "edit" && selectedId) {
      const { error: err } = await insforgeClient.database
        .from("platos")
        .update({
          nombre: form.nombre.trim(),
          precio,
          categoria: form.categoria,
          disponible: form.disponible,
          va_a_cocina: form.va_a_cocina
        })
        .eq("id", selectedId)
        .eq("tenant_id", tenantId);
      if (err) {
        console.error("Error al actualizar plato:", err);
        setError(`Error: ${err.message || "No se pudo actualizar el plato"}`);
        setSaving(false);
        return;
      }
      setPlatos((prev) => prev.map((p) => p.id === selectedId ? { ...p, nombre: form.nombre.trim(), precio, categoria: form.categoria, disponible: form.disponible, va_a_cocina: form.va_a_cocina } : p));
      setMode(null);
      setSelectedId(null);
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!tenantId) {
      alert("No hay restaurante asociado a la sesión.");
      return;
    }
    const plato = platos.find((p) => p.id === id);
    if (!plato) return;

    const { data: consumos, error: consumosError } = await insforgeClient.database
      .from("consumos")
      .select("id")
      .eq("plato_id", id)
      .eq("tenant_id", tenantId);

    if (consumosError) {
      console.error("Error al verificar consumos:", consumosError);
      alert("Error al verificar el historial del plato.");
      return;
    }

    const tieneHistorial = consumos && consumos.length > 0;
    let mensaje = `¿Estás seguro de eliminar "${plato.nombre}"?\n\n`;
    if (tieneHistorial) {
      mensaje += `⚠️ ESTE PLATO TIENE HISTORIAL:\n`;
      mensaje += `• ${consumos.length} consumo(s) asociado(s)\n`;
      mensaje += `• Se eliminarán TODOS los consumos relacionados\n`;
      mensaje += `• Esta acción NO se puede deshacer\n\n`;
    } else {
      mensaje += `Este plato no tiene historial de consumo.\n\n`;
    }
    mensaje += `¿Confirmas la eliminación?`;

    const confirmado = confirm(mensaje);
    if (!confirmado) return;

    if (tieneHistorial) {
      const { error: deleteConsumosError } = await insforgeClient.database
        .from("consumos")
        .delete()
        .eq("plato_id", id)
        .eq("tenant_id", tenantId);
      if (deleteConsumosError) {
        alert(`Error al eliminar consumos: ${deleteConsumosError.message}`);
        return;
      }
    }

    const { error: deletePlatoError } = await insforgeClient.database
      .from("platos")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (deletePlatoError) {
      alert(`Error al eliminar el plato: ${deletePlatoError.message}`);
      return;
    }

    setPlatos((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setMode(null);
    }
    alert(`✅ Plato "${plato.nombre}" eliminado correctamente.${tieneHistorial ? ` (${consumos.length} consumo(s) eliminado(s) en cascada)` : ""}`);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[14px]">Cargando carta...</span>
      </div>
    );
  }

  const CELL = 140;
  const GAP = 10;

  return (
    <div className="flex-1 flex overflow-hidden min-h-0 bg-background transition-colors duration-300">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className={`flex flex-wrap items-center justify-between gap-[12px] px-4 sm:px-[24px] py-[12px] sm:py-[16px] border-b shrink-0 ${isDark ? "border-white/10" : "border-black/10"}`}>
          <div className="flex flex-wrap gap-[8px]">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`px-[14px] py-[6px] rounded-[8px] shrink-0 font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase border cursor-pointer transition-all ${activeFilter === cat ? "bg-primary text-primary-foreground border-primary" : (isDark ? "bg-card border-white/10 text-muted-foreground" : "bg-muted border-black/5 text-muted-foreground")}`}
              >{cat}</button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="bg-primary text-primary-foreground rounded-[10px] px-[16px] py-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] tracking-[0.5px] uppercase border-none cursor-pointer shrink-0 shadow-lg hover:opacity-90 transition-all"
          >
            + Nuevo Plato
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-[20px] bg-background/30">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[12px]">Sin platos en esta categoría.</span>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fill, ${CELL}px)`,
                gap: `${GAP}px`,
              }}
            >
              {filtered.map((plato) => {
                const isSelected = selectedId === plato.id && mode === "edit";
                const cc = catColor(plato.categoria);
                return (
                  <div
                    key={plato.id}
                    onClick={() => openEdit(plato)}
                    style={{
                      width: CELL,
                      height: CELL,
                      backgroundColor: isSelected ? (isDark ? "rgba(255,144,109,0.12)" : "rgba(255,144,109,0.08)") : (isDark ? "oklch(0.2178 0 0)" : "white"),
                      border: isSelected ? "2px solid var(--primary)" : (isDark ? `1px solid rgba(255,255,255,0.08)` : `1px solid black`),
                      borderTop: `3px solid ${cc}`,
                      borderRadius: 12,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      padding: "12px",
                      userSelect: "none",
                      transition: "all 0.15s",
                      opacity: plato.disponible ? 1 : 0.4,
                    }}
                    className="shadow-sm hover:shadow-md"
                  >
                    <div className="flex flex-col gap-[4px] w-full">
                      <div className="flex items-center gap-[4px] flex-wrap">
                        <div
                          className="rounded-[4px] px-[5px] py-[2px]"
                          style={{ backgroundColor: `${cc}15`, border: `1px solid ${cc}30` }}
                        >
                          <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.8px] uppercase" style={{ color: cc }}>
                            {plato.categoria}
                          </span>
                        </div>
                        {!plato.va_a_cocina && (
                          <div className="rounded-[4px] px-[5px] py-[2px] bg-[#15803d]/10 border border-[#15803d]/20">
                            <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.5px] uppercase text-[#15803d]">
                              Directo
                            </span>
                          </div>
                        )}
                      </div>
                      <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[12px] uppercase leading-tight line-clamp-2 ${isDark ? "text-white" : "text-black"}`}>
                        {plato.nombre}
                      </span>
                    </div>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px]" style={{ color: cc }}>
                      {formatMoney(plato.precio)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {mode !== null && (
        <div className={`w-[320px] shrink-0 border-l flex flex-col p-[24px] gap-[16px] overflow-y-auto shadow-xl transition-all ${isDark ? "bg-card border-white/10" : "bg-white border-black"}`}>
          <div className="flex items-center justify-between">
            <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>
              {mode === "add" ? "Nuevo Plato" : "Editar Plato"}
            </span>
            <button
              onClick={() => { setMode(null); setSelectedId(null); }}
              className="text-muted-foreground bg-transparent border-none cursor-pointer text-[22px] hover:text-foreground transition-colors leading-none"
            >×</button>
          </div>

          <div className={`h-px ${isDark ? "bg-white/10" : "bg-black/10"}`} />

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-[8px] px-[12px] py-[8px]">
              <span className="font-['Inter',sans-serif] text-destructive text-[12px] font-medium">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-[16px]">
            <Field label="Nombre">
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del plato"
                className={`w-full rounded-[10px] px-[14px] py-[10px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
              />
            </Field>

            <Field label={`Precio (${currencySymbol})`}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                placeholder="0.00"
                className={`w-full rounded-[10px] px-[14px] py-[10px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
              />
            </Field>

            <Field label="Categoría">
              <select
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                className={`w-full rounded-[10px] px-[14px] py-[10px] font-['Inter',sans-serif] text-[13px] outline-none border cursor-pointer transition-colors ${isDark ? "bg-background border-white/10 text-white" : "bg-muted border-black/10 text-black"}`}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c} style={{ backgroundColor: isDark ? "#1a1a1a" : "white" }}>{c}</option>
                ))}
              </select>
            </Field>

            <div className="flex items-center justify-between">
              <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[0.5px] uppercase font-bold">Disponible</span>
              <button
                onClick={() => setForm((f) => ({ ...f, disponible: !f.disponible }))}
                className={`rounded-full px-[12px] py-[5px] font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase border cursor-pointer transition-all ${form.disponible ? "bg-[#15803d]/10 text-[#15803d] border-[#15803d]/20" : "bg-muted text-muted-foreground border-black/5"}`}
              >
                {form.disponible ? "Sí" : "No"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-[2px]">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] tracking-[0.5px] uppercase font-bold">Pasa por cocina</span>
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[9px]">Bebidas/Botellas → No</span>
              </div>
              <button
                onClick={() => setForm((f) => ({ ...f, va_a_cocina: !f.va_a_cocina }))}
                className={`rounded-full px-[12px] py-[5px] font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase border cursor-pointer transition-all ${form.va_a_cocina ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-black/5"}`}
              >
                {form.va_a_cocina ? "Sí" : "No"}
              </button>
            </div>
          </div>

          <div className={`h-px mt-2 ${isDark ? "bg-white/10" : "bg-black/10"}`} />

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground rounded-[12px] px-[16px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-[1px] border-none cursor-pointer shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>

          {mode === "edit" && selected && (
            <button
              onClick={() => handleDelete(selected.id)}
              className={`rounded-[12px] px-[16px] py-[12px] font-['Inter',sans-serif] font-bold text-[12px] uppercase cursor-pointer border transition-colors ${isDark ? "bg-transparent border-destructive/40 text-destructive hover:bg-destructive/10" : "bg-white border-destructive/60 text-destructive hover:bg-destructive/5"}`}
            >
              Eliminar plato
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// USUARIOS PANEL
// ─────────────────────────────────────────────
function UsuariosPanel() {
  const { tenantId, tenantUser, user } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [teamUsers, setTeamUsers] = useState<TenantUserRow[]>([]);
  const [tenantLimitConfig, setTenantLimitConfig] = useState<TenantUserLimitConfig>({
    userLimitEnabled: false,
    adminUserLimit: null,
    cajeraUserLimit: null,
    cocinaUserLimit: null,
    meseroUserLimit: null,
  });
  const [listLoading, setListLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<(typeof STAFF_ROLES)[number]["value"]>("cajera");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const adminEmail = tenantUser?.email?.trim() ?? "";

  async function loadUsers() {
    if (!tenantId) {
      setTeamUsers([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    const [usersRes, tenantRes] = await Promise.all([
      insforgeClient.database
        .from("tenant_users")
        .select("id, email, rol, nombre, activo, auth_user_id")
        .eq("tenant_id", tenantId)
        .order("email"),
      insforgeClient.database
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .maybeSingle(),
    ]);
    if (!usersRes.error && usersRes.data) setTeamUsers(usersRes.data as TenantUserRow[]);
    else setTeamUsers([]);
    if (!tenantRes.error && tenantRes.data) {
      setTenantLimitConfig(extractTenantUserLimitConfig(tenantRes.data as TenantRow));
    }
    setListLoading(false);
  }

  useEffect(() => {
    void loadUsers();
  }, [tenantId]);

  async function handleDeleteUser(row: TenantUserRow) {
    if (!tenantId) return;
    if (row.auth_user_id && user?.id && row.auth_user_id === user.id) {
      alert("No podés eliminar tu propia cuenta desde aquí.");
      return;
    }
    const activeAdmins = teamUsers.filter((u) => u.rol === "admin" && u.activo !== false);
    if (row.rol === "admin" && activeAdmins.length <= 1) {
      alert("No podés eliminar el único administrador del negocio.");
      return;
    }
    if (!confirm(`¿Eliminar el acceso de «${row.email}» a este negocio?`)) {
      return;
    }
    setDeletingId(row.id);
    const { error: delErr } = await insforgeClient.database
      .from("tenant_users")
      .delete()
      .eq("id", row.id)
      .eq("tenant_id", tenantId);
    setDeletingId(null);
    if (delErr) {
      alert(`Error: ${delErr.message}`);
      return;
    }
    await loadUsers();
  }

  async function handleCreate() {
    if (!email.trim() || !password.trim()) {
      setError("Email y contraseña son requeridos.");
      return;
    }
    if (!adminPassword.trim()) {
      setError("Ingresá tu contraseña de administrador para finalizar.");
      return;
    }
    if (password.length < 6) {
      setError("Mínimo 6 caracteres para el nuevo usuario.");
      return;
    }
    if (!tenantId || !adminEmail) {
      setError("Sin sesión de negocio válida.");
      return;
    }

    setCreating(true);
    setError("");
    setSuccess("");

    const currentForRole = countActiveUsersByRole(teamUsers, rol);
    const roleLimit = getLimitForRole(tenantLimitConfig, rol);
    if (roleLimit !== null && currentForRole >= roleLimit) {
      setError(`Límite alcanzado para rol ${formatRoleLabel(rol)} (${roleLimit}).`);
      setCreating(false);
      return;
    }

    const { data: signData, error: authError } = await insforgeClient.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(typeof authError === "string" ? authError : (authError as any)?.message ?? "Error Auth.");
      setCreating(false);
      return;
    }

    const newUserId = (signData as any)?.user?.id;
    if (!newUserId) {
      setError("Error interno: No se obtuvo el ID del nuevo usuario.");
      setCreating(false);
      return;
    }

    const { error: insertError } = await insforgeClient.database.from("tenant_users").insert([
      {
        auth_user_id: newUserId,
        tenant_id: tenantId,
        email: email.trim(),
        password_hash: "MANAGED_BY_AUTH",
        rol,
        nombre: nombre.trim() || null,
        activo: true,
      },
    ]);

    if (insertError) {
      await insforgeClient.auth.signOut();
      sessionStorage.setItem("cyberbistro_login_notice", `Usuario creado pero no vinculado. Re-ingresa con tu cuenta.`);
      navigate("/", { replace: true });
      return;
    }

    await insforgeClient.auth.signOut();
    const { error: reinError } = await insforgeClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    if (reinError) {
      sessionStorage.setItem("cyberbistro_login_notice", `Usuario creado. Iniciá sesión de nuevo.`);
      navigate("/", { replace: true });
      return;
    }

    setSuccess(`Usuario ${email} creado correctamente.`);
    setEmail(""); setPassword(""); setAdminPassword(""); setNombre(""); setRol("cajera");
    setCreating(false);
    await loadUsers();
  }

  return (
    <div className="flex-1 p-4 sm:p-[32px] overflow-auto bg-background transition-colors duration-300">
      <div className="max-w-[920px] flex flex-col gap-[24px]">
        <section className={`rounded-[20px] border p-[28px] flex flex-col gap-[16px] shadow-sm ${isDark ? "bg-card border-white/5" : "bg-white border-black"}`}>
          <div className="flex flex-col gap-[4px]">
            <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>Usuarios del negocio</span>
            <span className="font-['Inter',sans-serif] text-muted-foreground text-[12px] font-medium leading-relaxed">
              Solo usuarios vinculados a tu restaurante. El administrador no puede borrarse a sí mismo ni quitar el único admin.
            </span>
            {tenantLimitConfig.userLimitEnabled ? (
              <div className="mt-1 flex items-center gap-2">
                 <div className="size-2 rounded-full bg-[#ffb020]" />
                 <span className="font-['Inter',sans-serif] text-[#ffb020] text-[11px] font-bold uppercase tracking-wide">
                   Límites activos · Cajera: {tenantLimitConfig.cajeraUserLimit ?? "∞"} · Cocina: {tenantLimitConfig.cocinaUserLimit ?? "∞"}
                 </span>
              </div>
            ) : null}
          </div>
          
          {listLoading ? (
            <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px] font-bold">Cargando lista…</span>
          ) : teamUsers.length === 0 ? (
            <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px] font-bold">No hay usuarios registrados.</span>
          ) : (
            <div className={`overflow-x-auto rounded-[12px] border ${isDark ? "border-white/10" : "border-black/10 shadow-sm"}`}>
              <table className="w-full text-left border-collapse min-w-[520px]">
                <thead>
                  <tr className={`${isDark ? "bg-muted/20 text-white/60" : "bg-muted/50 text-black/60"} font-['Inter',sans-serif] text-[10px] uppercase tracking-wide`}>
                    <th className="px-[16px] py-[12px]">Email</th>
                    <th className="px-[16px] py-[12px]">Nombre</th>
                    <th className="px-[16px] py-[12px]">Rol</th>
                    <th className="px-[16px] py-[12px]">Activo</th>
                    <th className="px-[16px] py-[12px] w-[100px]"></th>
                  </tr>
                </thead>
                <tbody className={`font-['Inter',sans-serif] text-[13px] font-medium ${isDark ? "text-white" : "text-black"}`}>
                  {teamUsers.map((u) => {
                    const isSelf = Boolean(u.auth_user_id && user?.id && u.auth_user_id === user.id);
                    const canDelete = !isSelf && !(u.rol === "admin" && teamUsers.filter(x => x.rol === "admin").length <= 1);
                    return (
                      <tr key={u.id} className={`border-t transition-colors hover:bg-muted/5 ${isDark ? "border-white/5" : "border-black/5"}`}>
                        <td className="px-[16px] py-[14px] font-bold">{u.email}</td>
                        <td className="px-[16px] py-[14px] text-muted-foreground font-medium">{u.nombre || "—"}</td>
                        <td className="px-[16px] py-[14px] capitalize">{u.rol}</td>
                        <td className="px-[16px] py-[14px]">{u.activo === false ? "No" : "Sí"}</td>
                        <td className="px-[16px] py-[14px]">
                          <button
                            type="button"
                            disabled={!canDelete || deletingId === u.id}
                            onClick={() => void handleDeleteUser(u)}
                            className="text-destructive text-[11px] font-bold uppercase tracking-wide cursor-pointer bg-transparent border-none disabled:opacity-30 hover:underline"
                          >
                            {deletingId === u.id ? "…" : "Eliminar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={`rounded-[20px] border p-[28px] flex flex-col gap-[18px] shadow-sm ${isDark ? "bg-card border-white/5" : "bg-white border-black"}`}>
          <div className="flex flex-col gap-[4px]">
            <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] ${isDark ? "text-white" : "text-black"}`}>Crear usuario de equipo</span>
            <span className="font-['Inter',sans-serif] text-muted-foreground text-[12px] font-medium leading-relaxed">
              Queda vinculado solo al restaurante de tu sesión. Elegí rol de cajera/venta o cocina.
            </span>
          </div>
          
          {success && (
            <div className="bg-[#15803d]/10 border border-[#15803d]/20 rounded-[10px] px-[16px] py-[10px]">
              <span className="font-['Inter',sans-serif] text-[#15803d] text-[13px] font-bold">{success}</span>
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-[10px] px-[16px] py-[10px]">
              <span className="font-['Inter',sans-serif] text-destructive text-[13px] font-bold">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
            <Field label="Rol en el negocio">
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as any)}
                className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border cursor-pointer transition-colors ${isDark ? "bg-background border-white/10 text-white" : "bg-muted border-black/10 text-black"}`}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value} style={{ backgroundColor: isDark ? "#1a1a1a" : "white" }}>{r.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Nombre (opcional)">
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. María — cocina"
                className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
              />
            </Field>

            <Field label="Email del nuevo usuario">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@restaurante.com"
                className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
              />
            </Field>

            <Field label="Contraseña del nuevo usuario">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
              />
            </Field>

            <div className="md:col-span-2">
              <div className={`h-px my-4 ${isDark ? "bg-white/10" : "bg-black/10"}`} />
              <Field label="Tu contraseña de administrador">
                <span className="font-['Inter',sans-serif] text-muted-foreground text-[11px] mb-2 block font-medium">Requerida para confirmar la operación y re-autenticar tu sesión.</span>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Tu contraseña actual"
                  className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
                />
              </Field>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-primary text-primary-foreground rounded-[12px] px-[28px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-[1px] border-none cursor-pointer shadow-lg hover:opacity-90 transition-all disabled:opacity-50 self-start mt-4"
          >
            {creating ? "Creando..." : "Crear usuario"}
          </button>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANEL DE MESAS
// ─────────────────────────────────────────────
function MesasPanel() {
  const { tenantId } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [cantidad, setCantidad] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    loadCantidadMesas(tenantId).then(val => {
      setCantidad(val);
      setLoading(false);
    });
  }, [tenantId]);

  async function handleSave() {
    if (!tenantId) return;
    if (cantidad < 1 || cantidad > 100) { alert("Entre 1 y 100."); return; }
    setSaving(true);
    const { error } = await saveCantidadMesas(tenantId, cantidad);
    setSaving(false);
    if (error) alert("Error: " + error.message);
    else alert("Configuración guardada.");
  }

  if (loading) return <div className="p-8 text-muted-foreground font-bold bg-background transition-colors duration-300">Cargando...</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-[32px] bg-background transition-colors duration-300">
      <div className="max-w-[500px]">
        <h2 className={`font-['Space_Grotesk',sans-serif] font-bold text-[18px] mb-[4px] ${isDark ? "text-white" : "text-black"}`}>Configuración de Mesas</h2>
        <p className="font-['Inter',sans-serif] text-muted-foreground text-[13px] mb-[24px] font-medium leading-relaxed">
          Modifica la cantidad total de mesas disponibles. El sistema las distribuirá en la grilla automáticamente.
        </p>
        
        <div className={`rounded-[20px] border p-[28px] flex flex-col gap-[20px] shadow-sm ${isDark ? "bg-card border-white/5" : "bg-white border-black"}`}>
          <Field label="Cantidad de Mesas">
            <input
              type="number"
              min="1" max="100"
              value={cantidad}
              onChange={(e) => setCantidad(parseInt(e.target.value) || 1)}
              className={`w-full rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-[13px] outline-none border transition-colors ${isDark ? "bg-background border-white/10 text-white focus:border-primary/50" : "bg-muted border-black/10 text-black focus:border-primary"}`}
            />
          </Field>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground rounded-[12px] px-[24px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[14px] uppercase tracking-[1px] border-none cursor-pointer shadow-lg hover:opacity-90 transition-all disabled:opacity-50 self-start"
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PANEL (tabs after unlock)
// ─────────────────────────────────────────────
type Tab = "usuarios" | "carta" | "mesas";

function SoportePanel({ onLock }: { onLock: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("carta");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      {/* Tab header */}
      <div className={`flex flex-wrap items-center justify-between px-4 sm:px-[32px] pt-[16px] sm:pt-[20px] border-b shrink-0 ${isDark ? "border-white/10" : "border-black"}`}>
        <div className="flex items-end gap-[4px]">
          <h1 className={`font-['Space_Grotesk',sans-serif] font-bold text-[24px] mr-[16px] ${isDark ? "text-white" : "text-black"}`}>Soporte</h1>
          {(["carta", "usuarios", "mesas"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-[16px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[13px] tracking-[0.5px] uppercase border-none cursor-pointer transition-all bg-transparent relative ${activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "carta" ? "Carta" : tab === "usuarios" ? "Usuarios" : "Mesas"}
              {activeTab === tab && (
                <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary rounded-t-full" />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onLock}
          className={`font-['Inter',sans-serif] text-[11px] tracking-[0.5px] uppercase font-bold cursor-pointer bg-muted/50 border rounded-[8px] px-[12px] py-[6px] transition-all mb-[12px] ${isDark ? "border-white/10 text-white hover:bg-muted" : "border-black text-black hover:bg-muted"}`}
        >
          Bloquear
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === "carta" ? <CartaPanel /> : activeTab === "usuarios" ? <UsuariosPanel /> : <MesasPanel />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export function Soporte() {
  const navigate = useNavigate();
  const { loading, isAuthenticated, rol } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [unlocked, setUnlocked] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[200px] bg-background">
        <span className="font-['Space_Grotesk',sans-serif] text-muted-foreground text-[14px] font-bold">Cargando...</span>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (rol !== "admin") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 min-h-[320px] bg-background">
        <div className={`rounded-full size-16 flex items-center justify-center ${isDark ? "bg-card" : "bg-muted"}`}>
          <span className="text-2xl">🔒</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className={`font-['Space_Grotesk',sans-serif] font-bold text-[20px] text-center max-w-md ${isDark ? "text-white" : "text-black"}`}>
            Soporte Restringido
          </span>
          <span className="font-['Inter',sans-serif] text-muted-foreground text-[13px] text-center max-w-md leading-relaxed font-medium">
            Los usuarios de equipo no tienen acceso a este módulo. Solo el administrador puede gestionar la configuración.
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="bg-primary text-primary-foreground rounded-[12px] px-[28px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[13px] tracking-[0.5px] uppercase cursor-pointer border-none shadow-lg hover:opacity-90 transition-all"
        >
          Volver al panel
        </button>
      </div>
    );
  }

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  return <SoportePanel onLock={() => setUnlocked(false)} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <div className="flex flex-col gap-[8px]">
      <label className={`font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.8px] uppercase ${theme === "dark" ? "text-white/60" : "text-black/60"}`}>{label}</label>
      {children}
    </div>
  );
}
