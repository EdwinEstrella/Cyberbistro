import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { insforgeClient } from "../../../shared/lib/insforge";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useTenantCurrency } from "../../../shared/hooks/useTenantCurrency";
import { APP_ACCESS_PIN } from "../../../shared/lib/accessPin";
import {
  MENU_CATEGORIES,
  MENU_CATEGORY_COLORS,
  sortCategoriesForTabs,
} from "../../../shared/lib/menuCategories";
import { loadCantidadMesas, saveCantidadMesas } from "../../../shared/lib/tenantMesasSettings";
import {
  countActiveUsersByRole,
  extractTenantUserLimitConfig,
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
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[24px]">Soporte</span>
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
                className="w-[72px] h-[72px] rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer transition-all active:scale-95 bg-muted text-foreground border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
                style={{
                  color: isDel ? "#ff716c" : "currentColor",
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
    if (!tenantId) return;
    const plato = platos.find((p) => p.id === id);
    if (!plato) return;
    if (!confirm(`¿Estás seguro de eliminar "${plato.nombre}"? Esta acción no se puede deshacer.`)) return;

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
    if (selectedId === id) { setSelectedId(null); setMode(null); }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando carta...</div>;

  const CELL = 140;
  const GAP = 10;

  return (
    <div className="flex-1 flex overflow-hidden min-h-0 bg-background transition-colors duration-300">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-[12px] px-4 sm:px-[24px] py-[12px] sm:py-[16px] border-b border-black/10 dark:border-white/10 shrink-0">
          <div className="flex gap-[8px] overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className="px-[14px] py-[6px] rounded-[8px] shrink-0 font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase border border-black/5 dark:border-white/5 cursor-pointer transition-all bg-muted text-muted-foreground hover:text-foreground"
                style={{
                  backgroundColor: activeFilter === cat ? "var(--primary)" : undefined,
                  color: activeFilter === cat ? "var(--primary-foreground)" : undefined,
                }}
              >{cat}</button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="bg-primary text-primary-foreground rounded-[10px] px-[16px] py-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[12px] tracking-[0.5px] uppercase border-none cursor-pointer shrink-0 shadow-lg"
          >
            + Nuevo Plato
          </button>
        </div>

        <div className="flex-1 overflow-auto p-[20px]">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-[40px] text-muted-foreground font-['Inter'] text-[12px]">Sin platos en esta categoría.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${CELL}px)`, gap: `${GAP}px` }}>
              {filtered.map((plato) => {
                const isSelected = selectedId === plato.id && mode === "edit";
                const cc = catColor(plato.categoria);
                return (
                  <div
                    key={plato.id}
                    onClick={() => openEdit(plato)}
                    className="bg-card rounded-[12px] border border-black/10 dark:border-white/10 cursor-pointer flex flex-col items-start justify-between p-[12px] transition-all relative overflow-hidden"
                    style={{
                      borderTop: `3px solid ${cc}`,
                      opacity: plato.disponible ? 1 : 0.4,
                      boxShadow: isSelected ? "0 0 16px var(--primary-alpha)" : undefined,
                      borderColor: isSelected ? "var(--primary)" : undefined,
                    }}
                  >
                    <div className="flex flex-col gap-[4px] w-full">
                      <div className="flex items-center gap-[4px] flex-wrap">
                        <div className="rounded-[4px] px-[5px] py-[2px] border border-black/5" style={{ backgroundColor: `${cc}15` }}>
                          <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.8px] uppercase" style={{ color: cc }}>{plato.categoria}</span>
                        </div>
                        {!plato.va_a_cocina && (
                          <div className="rounded-[4px] px-[5px] py-[2px] bg-green-500/10 border border-green-500/20">
                            <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.5px] uppercase text-green-600 dark:text-green-400">Directo</span>
                          </div>
                        )}
                      </div>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[12px] uppercase leading-tight line-clamp-2">{plato.nombre}</span>
                    </div>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px]" style={{ color: cc }}>{formatMoney(plato.precio)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {mode !== null && (
        <div className="w-[320px] shrink-0 bg-sidebar border-l border-black/10 dark:border-white/10 flex flex-col p-[24px] gap-[16px] overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-foreground text-[18px]">{mode === "add" ? "Nuevo Plato" : "Editar Plato"}</span>
            <button onClick={() => { setMode(null); setSelectedId(null); }} className="text-muted-foreground bg-transparent border-none cursor-pointer text-[20px] hover:text-foreground transition-colors">×</button>
          </div>
          <div className="h-px bg-black/5 dark:bg-white/5" />
          {error && <div className="bg-destructive/10 border border-destructive/20 rounded-[8px] px-[12px] py-[8px] text-destructive text-[12px] font-medium">{error}</div>}
          
          <div className="space-y-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nombre</label>
              <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="input-field" placeholder="Nombre del plato" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">{`Precio (${currencySymbol})`}</label>
              <input type="number" step="0.01" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="input-field cursor-pointer">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Disponible</span>
              <button onClick={() => setForm(f => ({ ...f, disponible: !f.disponible }))} className={`rounded-full px-[12px] py-[5px] text-[10px] font-bold uppercase transition-all cursor-pointer border ${form.disponible ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400" : "bg-muted border-border text-muted-foreground"}`}>{form.disponible ? "Sí" : "No"}</button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col"><span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Cocina</span><span className="text-[9px] text-muted-foreground/60">¿Pasa por pedido de cocina?</span></div>
              <button onClick={() => setForm(f => ({ ...f, va_a_cocina: !f.va_a_cocina }))} className={`rounded-full px-[12px] py-[5px] text-[10px] font-bold uppercase transition-all cursor-pointer border ${form.va_a_cocina ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"}`}>{form.va_a_cocina ? "Sí" : "No"}</button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
            <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer">{saving ? "Guardando..." : "Guardar Plato"}</button>
            {mode === "edit" && selected && (
              <button onClick={() => handleDelete(selected.id)} className="bg-destructive/10 text-destructive rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest hover:bg-destructive/20 transition-all border border-destructive/20 cursor-pointer">Eliminar Plato</button>
            )}
          </div>
        </div>
      )}
      <style>{`
        .input-field {
          width: 100%;
          background: var(--muted);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// USUARIOS PANEL
// ─────────────────────────────────────────────
function UsuariosPanel() {
  const { tenantId, tenantUser, user } = useAuth();
  const navigate = useNavigate();
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

  async function loadUsers() {
    if (!tenantId) return;
    setListLoading(true);
    const [usersRes, tenantRes] = await Promise.all([
      insforgeClient.database.from("tenant_users").select("id, email, rol, nombre, activo, auth_user_id").eq("tenant_id", tenantId).order("email"),
      insforgeClient.database.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    ]);
    if (!usersRes.error && usersRes.data) setTeamUsers(usersRes.data as TenantUserRow[]);
    if (!tenantRes.error && tenantRes.data) setTenantLimitConfig(extractTenantUserLimitConfig(tenantRes.data as TenantRow));
    setListLoading(false);
  }

  useEffect(() => { void loadUsers(); }, [tenantId]);

  async function handleDeleteUser(row: TenantUserRow) {
    if (!tenantId || (row.auth_user_id === user?.id)) return;
    if (!confirm(`¿Eliminar el acceso de «${row.email}»?`)) return;
    setDeletingId(row.id);
    const { error } = await insforgeClient.database.from("tenant_users").delete().eq("id", row.id).eq("tenant_id", tenantId);
    setDeletingId(null);
    if (error) alert(error.message); else await loadUsers();
  }

  async function handleCreate() {
    if (!email.trim() || !password.trim() || !adminPassword.trim()) { setError("Completa todos los campos."); return; }
    if (!tenantId) return;
    setCreating(true); setError(""); setSuccess("");
    
    const staffEmail = email.trim();
    const currentForRole = countActiveUsersByRole(teamUsers, rol);
    const roleLimit = getLimitForRole(tenantLimitConfig, rol);
    if (roleLimit !== null && currentForRole >= roleLimit) {
      setError(`Límite de usuarios (${roleLimit}) alcanzado para este rol.`);
      setCreating(false); return;
    }

    const { data: signData, error: authError } = await insforgeClient.auth.signUp({ email: staffEmail, password });
    if (authError) { setError((authError as any).message); setCreating(false); return; }

    const newUserId = (signData as any)?.user?.id;
    const { error: insertError } = await insforgeClient.database.from("tenant_users").insert([{ auth_user_id: newUserId, tenant_id: tenantId, email: staffEmail, password_hash: "MANAGED_BY_AUTH", rol, nombre: nombre.trim() || null, activo: true }]);
    
    if (insertError) { setError(insertError.message); setCreating(false); return; }

    await insforgeClient.auth.signOut();
    const { error: reinError } = await insforgeClient.auth.signInWithPassword({ email: tenantUser?.email ?? "", password: adminPassword });
    if (reinError) { navigate("/"); return; }

    setSuccess(`Usuario creado.`); setEmail(""); setPassword(""); setAdminPassword(""); setNombre(""); await loadUsers();
    setCreating(false);
  }

  return (
    <div className="flex-1 p-4 sm:p-8 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[1000px] mx-auto grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 items-start">
        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm h-fit">
          <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground mb-1">Equipo de Trabajo</h2>
          <p className="text-muted-foreground text-[13px] mb-6">Gestión de accesos para cajeras y personal de cocina.</p>
          
          {listLoading ? <div className="py-10 text-center text-muted-foreground text-sm">Cargando...</div> : (
            <div className="overflow-x-auto rounded-xl border border-black/5 dark:border-white/5 bg-muted/20">
               <table className="w-full text-left border-collapse">
                  <thead className="bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                     <tr><th className="px-4 py-3">Email / Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3 text-right">Acción</th></tr>
                  </thead>
                  <tbody className="text-[13px] divide-y divide-black/5 dark:divide-white/5">
                     {teamUsers.map(u => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                           <td className="px-4 py-4"><div className="text-foreground font-medium">{u.email}</div><div className="text-[11px] text-muted-foreground">{u.nombre || "Sin nombre"}</div></td>
                           <td className="px-4 py-4 uppercase text-[11px] font-bold text-primary">{u.rol}</td>
                           <td className="px-4 py-4 text-right">
                              <button onClick={() => void handleDeleteUser(u)} disabled={deletingId === u.id || u.auth_user_id === user?.id} className="text-destructive/60 hover:text-destructive font-bold text-[11px] uppercase tracking-widest border-none bg-transparent cursor-pointer disabled:opacity-20 transition-colors">Eliminar</button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          )}
        </div>

        <div className="bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-sm h-fit flex flex-col gap-6">
           <h2 className="font-['Space_Grotesk'] text-xl font-bold text-foreground">Crear Acceso</h2>
           {success && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-600 dark:text-green-400 text-sm">{success}</div>}
           {error && <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 text-destructive text-sm">{error}</div>}
           
           <div className="space-y-4">
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Rol</label>
                <select value={rol} onChange={e => setRol(e.target.value as any)} className="input-field cursor-pointer">
                  {STAFF_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Nombre</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="input-field" placeholder="Ej. Juan - Caja" />
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="email@negocio.com" />
              </div>
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="Mín. 6 caracteres" />
              </div>
              <div className="h-px bg-black/5 dark:bg-white/5 my-2" />
              <div className="flex flex-col gap-1.5"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Tu Contraseña (Admin)</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="input-field" placeholder="Confirma tu acceso" />
              </div>
           </div>
           <button onClick={handleCreate} disabled={creating} className="bg-primary text-primary-foreground rounded-xl py-3.5 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer mt-2">{creating ? "Creando..." : "Registrar Miembro"}</button>
        </div>
      </div>
      <style>{`
        .input-field {
          width: 100%;
          background: var(--muted);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANEL DE MESAS
// ─────────────────────────────────────────────
function MesasPanel() {
  const { tenantId } = useAuth();
  const [cantidad, setCantidad] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    loadCantidadMesas(tenantId).then(val => { setCantidad(val); setLoading(false); });
  }, [tenantId]);

  async function handleSave() {
    if (!tenantId) return;
    if (cantidad < 1 || cantidad > 100) { alert("Máximo 100 mesas."); return; }
    setSaving(true);
    const { error } = await saveCantidadMesas(tenantId, cantidad);
    setSaving(false);
    if (error) alert(error.message); else alert("Configuración guardada.");
  }

  if (loading) return <div className="p-10 text-muted-foreground font-['Space_Grotesk'] text-center">Cargando...</div>;

  return (
    <div className="flex-1 p-4 sm:p-10 bg-background transition-colors duration-300 overflow-y-auto">
      <div className="max-w-[520px] mx-auto bg-card rounded-[24px] border border-black/10 dark:border-white/10 p-6 sm:p-10 shadow-sm flex flex-col gap-8">
        <div className="space-y-2">
           <h2 className="font-['Space_Grotesk'] text-2xl font-bold text-foreground">Gestión de Mesas</h2>
           <p className="text-muted-foreground text-sm leading-relaxed">Define la cantidad total de mesas para tu salón. El sistema ajustará la distribución automáticamente.</p>
        </div>
        <div className="flex flex-col gap-6">
           <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Cantidad de Mesas</label>
              <input type="number" value={cantidad} onChange={e => setCantidad(parseInt(e.target.value) || 1)} className="input-field text-lg font-bold" />
           </div>
           <button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground rounded-xl py-4 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 disabled:opacity-50 transition-all border-none cursor-pointer">{saving ? "Guardando..." : "Guardar Distribución"}</button>
        </div>
      </div>
      <style>{`
        .input-field {
          width: 100%;
          background: var(--muted);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: all 0.2s;
        }
        .input-field:focus {
          border-color: var(--primary);
          background: transparent;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PANEL (tabs after unlock)
// ─────────────────────────────────────────────
type Tab = "usuarios" | "carta" | "mesas";

function SoportePanel({ onLock }: { onLock: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("carta");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] pt-[20px] pb-0 border-b border-black/10 dark:border-white/10 shrink-0">
        <div className="flex items-end gap-6">
          <h1 className="font-['Space_Grotesk'] font-bold text-foreground text-2xl pb-4">Panel Soporte</h1>
          <div className="flex gap-1">
            {(["carta", "usuarios", "mesas"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-4 font-['Space_Grotesk'] font-bold text-[13px] tracking-widest uppercase border-b-2 transition-all bg-transparent cursor-pointer ${activeTab === tab ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
              >
                {tab === "carta" ? "Carta" : tab === "usuarios" ? "Usuarios" : "Mesas"}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onLock} className="px-4 py-2 mb-4 bg-muted text-muted-foreground border border-border rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer">Cerrar Sesión</button>
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
  const [unlocked, setUnlocked] = useState(false);

  if (loading) return <div className="flex-1 flex items-center justify-center font-['Space_Grotesk'] text-muted-foreground">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (rol !== "admin") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-background">
        <h2 className="font-['Space_Grotesk'] font-bold text-foreground text-2xl text-center max-w-md">Acceso Restringido</h2>
        <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">El módulo de Soporte está reservado para la administración del negocio. Si eres el dueño, asegúrate de estar usando tu cuenta principal.</p>
        <button onClick={() => navigate("/dashboard")} className="bg-primary text-primary-foreground rounded-xl px-8 py-3 font-bold uppercase text-[12px] tracking-widest shadow-lg hover:opacity-90 transition-all border-none cursor-pointer">Volver al Panel</button>
      </div>
    );
  }

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  return <SoportePanel onLock={() => setUnlocked(false)} />;
}
