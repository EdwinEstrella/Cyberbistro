import { useState, useEffect } from "react";
import { insforgeClient } from "../../../shared/lib/insforge";

const ACCESS_PIN = "1110";

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
      if (next === ACCESS_PIN) {
        onUnlock();
      } else {
        setShaking(true);
        setTimeout(() => { setPin(""); setShaking(false); }, 600);
      }
    }
  }

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-[32px]">
        <div className="flex flex-col items-center gap-[6px]">
          <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px]">Soporte</span>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[13px]">Ingresá el PIN para continuar</span>
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
                backgroundColor: i < pin.length ? (shaking ? "#ff716c" : "#ff906d") : "rgba(72,72,71,0.4)",
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
                className="w-[72px] h-[72px] rounded-[16px] font-['Space_Grotesk',sans-serif] font-bold text-[20px] cursor-pointer border-none transition-all active:scale-95"
                style={{
                  backgroundColor: isDel ? "rgba(255,113,108,0.1)" : "rgba(38,38,38,0.9)",
                  color: isDel ? "#ff716c" : "white",
                  border: "1px solid rgba(72,72,71,0.3)",
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

const RD = (n: number) =>
  "RD$ " + n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CAT_COLORS: Record<string, string> = {
  Hamburguesas: "#ff6aa0",
  Bebidas: "#59ee50",
  Sushi: "#ff906d",
  Pastas: "#ffd06d",
  Postres: "#ff784d",
  Entradas: "#adaaaa",
  General: "#6b7280",
};
function catColor(cat: string) { return CAT_COLORS[cat] ?? "#adaaaa"; }

const CATEGORIAS = ["Entradas", "Hamburguesas", "Pastas", "Sushi", "Postres", "Bebidas", "General"];

type FormMode = "add" | "edit" | null;

function CartaPanel() {
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<FormMode>(null);
  const [form, setForm] = useState({ nombre: "", precio: "", categoria: "General", disponible: true, va_a_cocina: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Todos");

  useEffect(() => {
    insforgeClient.database
      .from("platos")
      .select("*")
      .order("categoria")
      .then(({ data, error }) => {
        if (!error && data) setPlatos(data as Plato[]);
        setLoading(false);
      });
  }, []);

  const selected = platos.find((p) => p.id === selectedId) ?? null;
  const categories = ["Todos", ...Array.from(new Set(platos.map((p) => p.categoria)))];
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
          va_a_cocina: form.va_a_cocina
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
        .eq("id", selectedId);
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
    await insforgeClient.database.from("platos").update({ disponible: false }).eq("id", id);
    setPlatos((prev) => prev.map((p) => p.id === id ? { ...p, disponible: false } : p));
    if (selectedId === id) { setSelectedId(null); setMode(null); }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="font-['Space_Grotesk',sans-serif] text-[#6b7280] text-[14px]">Cargando carta...</span>
      </div>
    );
  }

  const CELL = 140;
  const GAP = 10;

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* Main grid area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-[12px] px-4 sm:px-[24px] py-[12px] sm:py-[16px] border-b border-[rgba(72,72,71,0.15)] shrink-0">
          <div className="flex gap-[8px] overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className="px-[14px] py-[6px] rounded-[8px] shrink-0 font-['Inter',sans-serif] font-bold text-[11px] tracking-[0.5px] uppercase border-none cursor-pointer transition-all"
                style={{
                  backgroundColor: activeFilter === cat ? "#ff906d" : "rgba(38,38,38,0.6)",
                  color: activeFilter === cat ? "#460f00" : "#6b7280",
                }}
              >{cat}</button>
            ))}
          </div>
          <button
            onClick={openAdd}
            className="bg-[#ff906d] rounded-[10px] px-[16px] py-[8px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[12px] tracking-[0.5px] uppercase border-none cursor-pointer shrink-0 shadow-[0_0_16px_rgba(255,144,109,0.2)]"
          >
            + Nuevo Plato
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-[20px]">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-[40px]">
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">Sin platos en esta categoría.</span>
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
                      backgroundColor: isSelected ? "rgba(255,144,109,0.1)" : "rgba(26,26,26,0.9)",
                      border: isSelected ? "2px solid rgba(255,144,109,0.7)" : `2px solid ${cc}30`,
                      borderTop: `3px solid ${cc}`,
                      boxShadow: isSelected ? "0 0 16px rgba(255,144,109,0.2)" : undefined,
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
                  >
                    <div className="flex flex-col gap-[4px] w-full">
                      <div className="flex items-center gap-[4px] flex-wrap">
                        <div
                          className="rounded-[4px] px-[5px] py-[2px]"
                          style={{ backgroundColor: `${cc}15` }}
                        >
                          <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.8px] uppercase" style={{ color: cc }}>
                            {plato.categoria}
                          </span>
                        </div>
                        {!plato.va_a_cocina && (
                          <div className="rounded-[4px] px-[5px] py-[2px] bg-[rgba(89,238,80,0.1)]">
                            <span className="font-['Inter',sans-serif] font-bold text-[8px] tracking-[0.5px] uppercase text-[#59ee50]">
                              Directo
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[12px] uppercase leading-tight line-clamp-2">
                        {plato.nombre}
                      </span>
                    </div>
                    <span className="font-['Space_Grotesk',sans-serif] font-bold text-[13px]" style={{ color: cc }}>
                      {RD(plato.precio)}
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
        <div className="w-[280px] shrink-0 bg-[#131313] border-l border-[rgba(72,72,71,0.2)] flex flex-col p-[24px] gap-[16px] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">
              {mode === "add" ? "Nuevo Plato" : "Editar Plato"}
            </span>
            <button
              onClick={() => { setMode(null); setSelectedId(null); }}
              className="text-[#6b7280] bg-transparent border-none cursor-pointer text-[18px] hover:text-white transition-colors"
            >×</button>
          </div>

          <div className="h-px bg-[rgba(72,72,71,0.2)]" />

          {error && (
            <div className="bg-[rgba(255,113,108,0.06)] border border-[rgba(255,113,108,0.2)] rounded-[8px] px-[12px] py-[8px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[12px]">{error}</span>
            </div>
          )}

          {/* Nombre */}
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">Nombre</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del plato"
              className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-[12px] py-[10px] font-['Inter',sans-serif] text-white text-[13px] outline-none w-full"
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")}
            />
          </div>

          {/* Precio */}
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">Precio (RD$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.precio}
              onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
              placeholder="0.00"
              className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-[12px] py-[10px] font-['Inter',sans-serif] text-white text-[13px] outline-none w-full"
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")}
            />
          </div>

          {/* Categoria */}
          <div className="flex flex-col gap-[6px]">
            <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">Categoría</label>
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[8px] px-[12px] py-[10px] font-['Inter',sans-serif] text-white text-[13px] outline-none w-full cursor-pointer"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} style={{ backgroundColor: "#1a1a1a" }}>{c}</option>
              ))}
            </select>
          </div>

          {/* Disponible */}
          <div className="flex items-center justify-between">
            <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.5px] uppercase">Disponible</span>
            <button
              onClick={() => setForm((f) => ({ ...f, disponible: !f.disponible }))}
              className="rounded-full px-[12px] py-[5px] font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase border-none cursor-pointer transition-all"
              style={{
                backgroundColor: form.disponible ? "rgba(89,238,80,0.12)" : "rgba(72,72,71,0.2)",
                color: form.disponible ? "#59ee50" : "#6b7280",
                border: form.disponible ? "1px solid rgba(89,238,80,0.3)" : "1px solid rgba(72,72,71,0.3)",
              }}
            >
              {form.disponible ? "Sí" : "No"}
            </button>
          </div>

          {/* Va a cocina */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-[2px]">
              <span className="font-['Inter',sans-serif] text-[#adaaaa] text-[11px] tracking-[0.5px] uppercase">Pasa por cocina</span>
              <span className="font-['Inter',sans-serif] text-[#6b7280] text-[9px]">Ej: bebidas en botella → No</span>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, va_a_cocina: !f.va_a_cocina }))}
              className="rounded-full px-[12px] py-[5px] font-['Inter',sans-serif] font-bold text-[10px] tracking-[0.5px] uppercase border-none cursor-pointer transition-all"
              style={{
                backgroundColor: form.va_a_cocina ? "rgba(255,144,109,0.12)" : "rgba(72,72,71,0.2)",
                color: form.va_a_cocina ? "#ff906d" : "#6b7280",
                border: form.va_a_cocina ? "1px solid rgba(255,144,109,0.3)" : "1px solid rgba(72,72,71,0.3)",
              }}
            >
              {form.va_a_cocina ? "Sí" : "No"}
            </button>
          </div>

          <div className="h-px bg-[rgba(72,72,71,0.2)]" />

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#ff906d] rounded-[10px] px-[16px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[13px] tracking-[0.5px] uppercase border-none cursor-pointer disabled:opacity-50 shadow-[0_0_16px_rgba(255,144,109,0.15)]"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>

          {/* Delete (edit mode only) */}
          {mode === "edit" && selected && (
            <button
              onClick={() => handleDelete(selected.id)}
              className="bg-transparent border border-[rgba(255,113,108,0.2)] rounded-[10px] px-[16px] py-[10px] font-['Inter',sans-serif] font-bold text-[#ff716c] text-[12px] tracking-[0.5px] uppercase cursor-pointer hover:bg-[rgba(255,113,108,0.06)] transition-colors"
            >
              Deshabilitar plato
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!email.trim() || !password.trim()) { setError("Email y contraseña son requeridos."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setCreating(true); setError(""); setSuccess("");
    const { error: authError } = await insforgeClient.auth.signUp({ email: email.trim(), password });
    if (authError) {
      const msg = typeof authError === "string" ? authError : (authError as { message?: string })?.message ?? "Error al crear el usuario.";
      setError(msg);
    } else {
      setSuccess(`Usuario ${email.trim()} creado exitosamente.`);
      setEmail(""); setPassword("");
    }
    setCreating(false);
  }

  return (
    <div className="flex-1 p-4 sm:p-[32px] overflow-auto">
      <div className="max-w-[520px] flex flex-col gap-[20px]">
        <div className="bg-[#131313] rounded-[20px] border border-[rgba(72,72,71,0.15)] p-[28px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-[4px]">
            <span className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[18px]">Crear Nuevo Usuario</span>
            <span className="font-['Inter',sans-serif] text-[#6b7280] text-[12px]">El usuario recibirá acceso al sistema CyberBistro.</span>
          </div>
          {success && (
            <div className="bg-[rgba(89,238,80,0.05)] border border-[rgba(89,238,80,0.2)] rounded-[10px] px-[16px] py-[10px]">
              <span className="font-['Inter',sans-serif] text-[#59ee50] text-[13px]">{success}</span>
            </div>
          )}
          {error && (
            <div className="bg-[rgba(255,113,108,0.05)] border border-[rgba(255,113,108,0.2)] rounded-[10px] px-[16px] py-[10px]">
              <span className="font-['Inter',sans-serif] text-[#ff716c] text-[13px]">{error}</span>
            </div>
          )}
          <div className="flex flex-col gap-[12px]">
            <div className="flex flex-col gap-[6px]">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@restaurante.com"
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-white text-[13px] outline-none w-full"
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")} />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="font-['Inter',sans-serif] text-[#adaaaa] text-[10px] tracking-[0.8px] uppercase">Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
                className="bg-[#1a1a1a] border border-[rgba(72,72,71,0.3)] rounded-[10px] px-[14px] py-[11px] font-['Inter',sans-serif] text-white text-[13px] outline-none w-full"
                onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,144,109,0.4)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(72,72,71,0.3)")}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating}
            className="bg-[#ff906d] rounded-[12px] px-[20px] py-[12px] font-['Space_Grotesk',sans-serif] font-bold text-[#460f00] text-[13px] tracking-[0.5px] uppercase cursor-pointer border-none shadow-[0_0_20px_rgba(255,144,109,0.15)] transition-opacity disabled:opacity-50 self-start">
            {creating ? "Creando..." : "Crear Usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PANEL (tabs after unlock)
// ─────────────────────────────────────────────
type Tab = "usuarios" | "carta";

function SoportePanel({ onLock }: { onLock: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("carta");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab header */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-[32px] pt-[16px] sm:pt-[20px] pb-[0px] gap-[8px] border-b border-[rgba(72,72,71,0.2)] shrink-0">
        <div className="flex items-end gap-[4px]">
          <h1 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] mr-[16px]">Soporte</h1>
          {(["carta", "usuarios"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-[16px] py-[10px] font-['Space_Grotesk',sans-serif] font-bold text-[13px] tracking-[0.5px] uppercase border-none cursor-pointer transition-all bg-transparent"
              style={{
                color: activeTab === tab ? "#ff906d" : "#6b7280",
                borderBottom: activeTab === tab ? "2px solid #ff906d" : "2px solid transparent",
              }}
            >
              {tab === "carta" ? "Carta" : "Usuarios"}
            </button>
          ))}
        </div>
        <button
          onClick={onLock}
          className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] tracking-[0.5px] uppercase cursor-pointer bg-transparent border border-[rgba(72,72,71,0.3)] rounded-[8px] px-[12px] py-[6px] hover:text-[#adaaaa] transition-colors mb-[10px]"
        >
          Bloquear
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === "carta" ? <CartaPanel /> : <UsuariosPanel />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export function Soporte() {
  const [unlocked, setUnlocked] = useState(false);
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  return <SoportePanel onLock={() => setUnlocked(false)} />;
}