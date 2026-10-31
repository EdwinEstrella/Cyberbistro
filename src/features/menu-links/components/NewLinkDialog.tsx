import { useState, useEffect } from "react";
import { X, Plus, AlertCircle, Building2, Globe } from "lucide-react";
import { toast } from "sonner";
import type { Menu, LinkType, MenuLink } from "../lib/types";
import { listCustomers, type Customer } from "../../clientes/lib/customers";
import { createMenuLink, createMenu, normalizeRepoError } from "../lib/menuLinksRepo";
import { getBusinessToday } from "../lib/menuBusinessDate";
import { getMondayOfWeek } from "../lib/menuSchedule";

interface NewLinkDialogProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  sucursalId?: string | null;
  menus: Menu[];
  onCreated: (newLink: MenuLink) => void;
  onRefreshMenus: () => Promise<void>;
}

export function NewLinkDialog({
  open,
  onClose,
  tenantId,
  sucursalId,
  menus,
  onCreated,
  onRefreshMenus,
}: NewLinkDialogProps) {
  const [label, setLabel] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("public");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [allowExtras, setAllowExtras] = useState(false);

  // Quick new menu creation inline
  const [creatingNewMenu, setCreatingNewMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuMode, setNewMenuMode] = useState<"recurring" | "weekly">("recurring");
  const [newMenuWeekStart, setNewMenuWeekStart] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setLinkType("public");
    setSelectedCustomerId("");
    setSelectedMenuId(menus[0]?.id ?? "");
    setAllowExtras(false);
    setCreatingNewMenu(false);
    setNewMenuName("");
    setNewMenuMode("recurring");
    setNewMenuWeekStart(getMondayOfWeek(getBusinessToday()));
    setError("");

    setLoadingCustomers(true);
    listCustomers(tenantId)
      .then((data) => {
        setCustomers(data);
        if (data.length > 0) setSelectedCustomerId(data[0].id);
      })
      .catch((err) => {
        console.warn("Error al cargar clientes:", err);
      })
      .finally(() => setLoadingCustomers(false));
  }, [open, tenantId, menus]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sucursalId) {
      setError("Seleccioná una sucursal antes de crear un link.");
      return;
    }

    if (!label.trim()) {
      setError("La etiqueta del link es obligatoria.");
      return;
    }

    if (linkType === "company" && !selectedCustomerId) {
      setError("Debes seleccionar una empresa o cliente.");
      return;
    }

    let menuId = selectedMenuId;

    setSaving(true);
    setError("");

    try {
      // If user selected to create a new menu inline
      if (creatingNewMenu) {
        if (!newMenuName.trim()) {
          setError("El nombre del nuevo menú es obligatorio.");
          setSaving(false);
          return;
        }

        const createdMenu = await createMenu({
          tenantId,
          sucursalId,
          name: newMenuName.trim(),
          scheduleMode: newMenuMode,
          weekStart: newMenuMode === "weekly" ? newMenuWeekStart : null,
        });
        menuId = createdMenu.id;
        await onRefreshMenus();
      }

      if (!menuId) {
        setError("Debes seleccionar o crear un menú para este link.");
        setSaving(false);
        return;
      }

      const newLink = await createMenuLink({
        tenantId,
        sucursalId,
        menuId,
        label: label.trim(),
        linkType,
        customerId: linkType === "company" ? selectedCustomerId : null,
        allowExtras,
      });

      toast.success("Link de menú creado exitosamente.");
      onCreated(newLink);
      onClose();
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudo crear el link.");
      setError(normalized.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl p-6 flex flex-col gap-5 text-card-foreground max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Cerrar"
        >
          <X className="size-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold font-['Space_Grotesk'] text-foreground">Nuevo link de menú</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Genera un enlace público o corporativo con un menú y reglas específicas.
          </p>
        </div>

        {!sucursalId && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>Seleccioná una sucursal antes de crear un link.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Label input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Etiqueta o nombre del link
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Menú Principal, Empresa Alfa, etc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Type selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Tipo de enlace
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLinkType("public")}
                className={`flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  linkType === "public"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe className="size-4" />
                Público
              </button>
              <button
                type="button"
                onClick={() => setLinkType("company")}
                className={`flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  linkType === "company"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="size-4" />
                Empresa (Corporativo)
              </button>
            </div>
          </div>

          {/* Company customer picker (only when linkType === 'company') */}
          {linkType === "company" && (
            <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Empresa / Cliente asignado
              </label>
              {loadingCustomers ? (
                <div className="text-xs text-muted-foreground py-2">Cargando clientes...</div>
              ) : customers.length === 0 ? (
                <div className="text-xs text-amber-500 py-1">
                  No se encontraron clientes. Registra uno primero en la sección Clientes.
                </div>
              ) : (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
                >
                  <option value="" disabled>Selecciona una empresa...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.document_id ? `(${c.document_id})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Menu picker or create new menu */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Menú asignado
              </label>
              <button
                type="button"
                onClick={() => setCreatingNewMenu((prev) => !prev)}
                className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus className="size-3" />
                {creatingNewMenu ? "Seleccionar existente" : "Crear menú nuevo"}
              </button>
            </div>

            {!creatingNewMenu ? (
              menus.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 rounded-xl bg-muted/30 border border-border text-center">
                  No hay menús disponibles. Haz clic en "Crear menú nuevo" arriba.
                </div>
              ) : (
                <select
                  value={selectedMenuId}
                  onChange={(e) => setSelectedMenuId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted/60 border border-border text-foreground text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
                >
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.schedule_mode === "weekly" ? "Semanal" : "Recurrente"})
                    </option>
                  ))}
                </select>
              )
            ) : (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-col gap-3 animate-in fade-in duration-150">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Nombre del menú</label>
                  <input
                    type="text"
                    value={newMenuName}
                    onChange={(e) => setNewMenuName(e.target.value)}
                    placeholder="Ej. Menú Ejecutivo, Carta Almuerzos"
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Modo de horario</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMenuMode("recurring")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                        newMenuMode === "recurring" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                      }`}
                    >
                      Recurrente
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMenuMode("weekly")}
                      className={`py-1.5 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                        newMenuMode === "weekly" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                      }`}
                    >
                      Semanal
                    </button>
                  </div>
                </div>
                {newMenuMode === "weekly" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-muted-foreground">Lunes de la semana</label>
                    <input
                      type="date"
                      value={newMenuWeekStart}
                      onChange={(e) => setNewMenuWeekStart(getMondayOfWeek(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Allow extras switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/30 border border-border mt-1">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Permitir extras en este link</span>
              <span className="text-[11px] text-muted-foreground">
                Los comensales podrán añadir ingredientes y extras a sus platos.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAllowExtras((prev) => !prev)}
              className={`rounded-full px-3.5 py-1 text-xs font-bold uppercase transition-all cursor-pointer border ${
                allowExtras
                  ? "bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {allowExtras ? "Sí" : "No"}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-3 pt-2">
            {!sucursalId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
                Seleccioná una sucursal antes de crear un link.
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving || !sucursalId}
                title={!sucursalId ? "Seleccioná una sucursal antes de crear un link." : undefined}
                className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-lg disabled:cursor-not-allowed"
              >
                {saving ? "Guardando..." : "Crear"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="py-3 px-5 rounded-xl bg-muted text-muted-foreground font-bold text-xs uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer border border-border"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
