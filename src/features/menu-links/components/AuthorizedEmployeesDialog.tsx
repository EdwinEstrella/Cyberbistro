import { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Upload,
  Users,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { canUseFeature } from "../../../shared/lib/planFeatures";
import type { MenuLink, MenuLinkEmployee } from "../lib/types";
import {
  fetchLinkEmployees,
  createLinkEmployee,
  updateLinkEmployee,
  toggleLinkEmployeeActive,
  deleteLinkEmployee,
  setLinkRequireRoster,
  bulkInsertLinkEmployees,
} from "../lib/rosterRepo";
import { parseRosterText } from "../lib/rosterParser";

interface AuthorizedEmployeesDialogProps {
  open: boolean;
  onClose: () => void;
  link: MenuLink;
  tenantId: string;
  plan: string | null | undefined;
  onRequireRosterChange?: (linkId: string, requireRoster: boolean) => void;
  onRosterCountChange?: (linkId: string, count: number) => void;
}

export function AuthorizedEmployeesDialog({
  open,
  onClose,
  link,
  tenantId,
  plan,
  onRequireRosterChange,
  onRosterCountChange,
}: AuthorizedEmployeesDialogProps) {
  const isFeatureAvailable = canUseFeature(plan, "employee_roster");

  const [activeTab, setActiveTab] = useState<"list" | "import">("list");
  const [employees, setEmployees] = useState<MenuLinkEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [requireRoster, setRequireRoster] = useState(Boolean(link.require_roster));

  // Add / Edit form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<MenuLinkEmployee | null>(null);
  const [formName, setFormName] = useState("");
  const [formCedula, setFormCedula] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Bulk import state
  const [bulkText, setBulkText] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);

  const parsedBulk = useMemo(() => parseRosterText(bulkText), [bulkText]);

  const loadEmployees = useCallback(async () => {
    if (!open || !link.id) return;
    setLoading(true);
    try {
      const data = await fetchLinkEmployees(link.id);
      setEmployees(data);
      onRosterCountChange?.(link.id, data.length);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar la lista de empleados.");
    } finally {
      setLoading(false);
    }
  }, [open, link.id, onRosterCountChange]);

  useEffect(() => {
    if (open) {
      setRequireRoster(Boolean(link.require_roster));
      void loadEmployees();
    }
  }, [open, link.require_roster, loadEmployees]);

  const handleToggleRequireRoster = async () => {
    if (!isFeatureAvailable) return;
    const nextState = !requireRoster;
    setRequireRoster(nextState);
    try {
      await setLinkRequireRoster(link.id, nextState);
      onRequireRosterChange?.(link.id, nextState);
      toast.success(
        nextState
          ? "Roster activado: solo empleados autorizados podrán pedir."
          : "Roster desactivado: cualquier persona puede ingresar su nombre."
      );
    } catch (err: any) {
      setRequireRoster(!nextState);
      toast.error(err.message || "No se pudo actualizar la configuración.");
    }
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    try {
      if (editingEmployee) {
        await updateLinkEmployee(editingEmployee.id, formName, formCedula);
        toast.success("Empleado actualizado.");
      } else {
        await createLinkEmployee(tenantId, link.id, formName, formCedula);
        toast.success("Empleado agregado al roster.");
      }
      setFormName("");
      setFormCedula("");
      setShowAddForm(false);
      setEditingEmployee(null);
      void loadEmployees();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el empleado.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleActive = async (emp: MenuLinkEmployee) => {
    const nextState = !emp.active;
    setEmployees((prev) =>
      prev.map((e) => (e.id === emp.id ? { ...e, active: nextState } : e))
    );
    try {
      await toggleLinkEmployeeActive(emp.id, nextState);
      toast.success(nextState ? "Empleado activado" : "Empleado desactivado");
    } catch (err: any) {
      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, active: emp.active } : e))
      );
      toast.error(err.message || "No se pudo cambiar el estado.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar a "${name}" del roster?`)) return;
    try {
      await deleteLinkEmployee(id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      onRosterCountChange?.(link.id, employees.length - 1);
      toast.success("Empleado eliminado.");
    } catch (err: any) {
      toast.error(err.message || "No se pudo eliminar.");
    }
  };

  const handleConfirmBulkImport = async () => {
    if (parsedBulk.validRows.length === 0) return;
    setBulkImporting(true);
    try {
      const payload = parsedBulk.validRows.map((r) => ({
        fullName: r.fullName,
        documentId: r.documentId,
      }));
      const res = await bulkInsertLinkEmployees(tenantId, link.id, payload);
      toast.success(`Se importaron ${res.insertedCount} empleados autorizados.`);
      setBulkText("");
      setActiveTab("list");
      void loadEmployees();
    } catch (err: any) {
      toast.error(err.message || "Error en la importación masiva.");
    } finally {
      setBulkImporting(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.document_id && e.document_id.includes(q))
    );
  }, [employees, search]);

  if (!open) return null;

  const companyName = link.customer?.name || link.label;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <h3 className="font-bold font-['Space_Grotesk'] text-lg text-foreground leading-tight">
                Empleados autorizados
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {companyName} · Control de acceso por nombre o cédula
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Feature gate banner if not corporativo */}
        {!isFeatureAvailable && (
          <div className="m-5 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
            <Lock className="size-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-amber-500 uppercase tracking-wider font-['Space_Grotesk']">
                  Disponible en el plan Corporativo
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                El control de empleados autorizados por cédula o nombre está disponible exclusivamente en el plan Corporativo. Actualizá tu plan para activar esta función y restringir pedidos solo al personal autorizado.
              </p>
            </div>
          </div>
        )}

        {/* Roster Toggle Bar */}
        <div className="px-5 py-3.5 bg-background border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Solo empleados autorizados
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {requireRoster ? "Activado" : "Desactivado"}
            </span>
            <button
              type="button"
              disabled={!isFeatureAvailable}
              onClick={handleToggleRequireRoster}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                requireRoster ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 left-1 ${
                  requireRoster ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-5 pt-3 border-b border-border flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === "list"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Lista de empleados ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "import"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Upload className="size-3.5" />
            Importación masiva
          </button>
        </div>

        {/* Dialog Body */}
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === "list" ? (
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o cédula..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground outline-none focus:border-primary transition"
                  />
                </div>
                <button
                  type="button"
                  disabled={!isFeatureAvailable}
                  onClick={() => {
                    setEditingEmployee(null);
                    setFormName("");
                    setFormCedula("");
                    setShowAddForm(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="size-3.5" />
                  Agregar
                </button>
              </div>

              {/* Add / Edit Form Modal / Box */}
              {showAddForm && (
                <form
                  onSubmit={handleSaveEmployee}
                  className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3"
                >
                  <h4 className="text-xs font-bold text-foreground">
                    {editingEmployee ? "Editar empleado" : "Nuevo empleado"}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        maxLength={80}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                        Cédula (opcional, 11 dígitos)
                      </label>
                      <input
                        type="text"
                        value={formCedula}
                        onChange={(e) => setFormCedula(e.target.value)}
                        placeholder="402-1234567-8"
                        maxLength={20}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingEmployee(null);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={formSaving}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {formSaving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </form>
              )}

              {/* Employee List */}
              {loading ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  Cargando empleados...
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                  <p className="text-xs text-muted-foreground">
                    {search
                      ? "No se encontraron empleados con esa búsqueda."
                      : "No hay empleados registrados en este link todavía."}
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {filteredEmployees.map((emp) => (
                    <div
                      key={emp.id}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground">
                            {emp.full_name}
                          </span>
                          {!emp.active && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-muted text-muted-foreground">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {emp.document_id
                            ? `Cédula: ${emp.document_id.replace(
                                /(\d{3})(\d{7})(\d{1})/,
                                "$1-$2-$3"
                              )}`
                            : "Sin cédula registrada"}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(emp)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border cursor-pointer ${
                            emp.active
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {emp.active ? "Activo" : "Inactivo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEmployee(emp);
                            setFormName(emp.full_name);
                            setFormCedula(emp.document_id || "");
                            setShowAddForm(true);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Editar"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(emp.id, emp.full_name)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Bulk Import View */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Pegá líneas con formato &quot;Nombre, Cédula&quot; (cédula opcional):
                </label>
                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Juan Pérez, 402-1234567-8\nMaría Gómez, 001-9876543-2\nCarlos Santana`}
                  className="w-full p-3 text-xs rounded-xl border border-border bg-background text-foreground font-mono outline-none focus:border-primary transition resize-none"
                />
              </div>

              {/* Parsed Preview */}
              {bulkText.trim() && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Vista previa ({parsedBulk.totalCount} filas)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500">
                        {parsedBulk.validRows.length} válidas
                      </span>
                      {parsedBulk.invalidRows.length > 0 && (
                        <span className="text-destructive">
                          {parsedBulk.invalidRows.length} con error
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-border text-xs">
                    {parsedBulk.rows.map((row) => (
                      <div
                        key={row.lineNumber}
                        className={`p-2.5 flex items-center justify-between gap-3 ${
                          row.isValid ? "bg-background" : "bg-destructive/5"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground block truncate">
                            {row.fullName || "(Nombre vacío)"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {row.documentId ? `Cédula: ${row.documentId}` : "Sin cédula"}
                          </span>
                        </div>
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase">
                            <Check className="size-3" /> Válido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                            <AlertCircle className="size-3" /> {row.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={bulkImporting || parsedBulk.validRows.length === 0 || !isFeatureAvailable}
                      onClick={handleConfirmBulkImport}
                      className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {bulkImporting
                        ? "Importando..."
                        : `Importar ${parsedBulk.validRows.length} empleados`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
