import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Plus,
  Copy,
  Check,
  QrCode,
  Edit3,
  Globe,
  Building2,
  Calendar,
  AlertTriangle,
  WifiOff,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { Menu, MenuLink } from "../lib/types";
import { fetchMenuLinks, fetchMenus, toggleMenuLinkEnabled, normalizeRepoError } from "../lib/menuLinksRepo";
import { buildMenuLinkUrl } from "../lib/menuLinkUrl";
import { formatWeekRange, isWeekPast } from "../lib/menuSchedule";
import { MenuQrModal } from "./MenuQrModal";
import { NewLinkDialog } from "./NewLinkDialog";

interface MenuLinksListProps {
  tenantId: string;
  sucursalId?: string | null;
}

export function MenuLinksList({ tenantId, sucursalId }: MenuLinksListProps) {
  const navigate = useNavigate();
  const [links, setLinks] = useState<MenuLink[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [qrModalState, setQrModalState] = useState<{ open: boolean; url: string; title: string }>({
    open: false,
    url: "",
    title: "",
  });

  const [newLinkOpen, setNewLinkOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [linksData, menusData] = await Promise.all([
        fetchMenuLinks(tenantId, sucursalId),
        fetchMenus(tenantId, sucursalId),
      ]);
      setLinks(linksData);
      setMenus(menusData);
    } catch (err: unknown) {
      const normalized = normalizeRepoError(err, "No se pudieron cargar los links de menú.");
      setError(normalized.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, sucursalId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleEnabled = async (link: MenuLink) => {
    const nextState = !link.enabled;
    // Optimistic update
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, enabled: nextState } : l)));
    try {
      await toggleMenuLinkEnabled(link.id, nextState);
      toast.success(nextState ? "Link activado" : "Link desactivado");
    } catch (err) {
      // Revert on error
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, enabled: link.enabled } : l)));
      const normalized = normalizeRepoError(err, "No se pudo cambiar el estado del link.");
      toast.error(normalized.message);
    }
  };

  const handleCopyLink = async (token: string, label: string) => {
    const url = buildMenuLinkUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      toast.success(`Enlace de "${label}" copiado al portapapeles`);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const handleOpenQr = (link: MenuLink) => {
    const url = buildMenuLinkUrl(link.token);
    setQrModalState({
      open: true,
      url,
      title: link.label,
    });
  };

  const filteredLinks = links.filter((l) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (
      l.label.toLowerCase().includes(term) ||
      (l.customer?.name && l.customer.name.toLowerCase().includes(term)) ||
      (l.menu?.name && l.menu.name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-hidden">
      {/* Top action / search bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6 border-b border-border bg-card/40 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por etiqueta, empresa o menú..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setNewLinkOpen(true)}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 transition-all cursor-pointer shadow-md"
          >
            <Plus className="size-4" />
            Nuevo link
          </button>
        </div>
      </div>

      {/* Network Error Banner */}
      {error && (
        <div className="m-4 sm:mx-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 text-destructive">
            <WifiOff className="size-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">{error}</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                Verifica tu conexión y presiona reintentar para cargar los links.
              </p>
            </div>
          </div>
          <button
            onClick={() => void loadData()}
            className="py-1.5 px-4 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Main content body */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 min-h-0">
        {loading && links.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <span className="text-xs font-semibold">Cargando links de menú...</span>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3 bg-card/40 rounded-2xl border border-dashed border-border p-8">
            <div className="p-3.5 rounded-full bg-primary/10 text-primary">
              <Globe className="size-6" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {search ? "No se encontraron links con esa búsqueda" : "No tienes links de menú creados"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {search
                ? "Prueba con otro término o limpia el filtro de búsqueda."
                : "Crea tu primer enlace para compartir un menú digital con clientes individuales o corporativos."}
            </p>
            {!search && (
              <button
                onClick={() => setNewLinkOpen(true)}
                className="mt-2 flex items-center gap-2 py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 transition-all cursor-pointer shadow-md"
              >
                <Plus className="size-4" />
                Crear primer link
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-bold uppercase tracking-wider text-muted-foreground text-[10px]">
                    <th className="py-3 px-4">Etiqueta</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Menú Asignado</th>
                    <th className="py-3 px-4 text-center">Extras</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLinks.map((link) => {
                    const isWeekly = link.menu?.schedule_mode === "weekly";
                    const isPast = isWeekly && link.menu?.week_start ? isWeekPast(link.menu.week_start) : false;
                    const menuScheduleLabel = isWeekly
                      ? link.menu?.week_start
                        ? formatWeekRange(link.menu.week_start)
                        : "Semanal"
                      : "Recurrente";

                    return (
                      <tr key={link.id} className="hover:bg-muted/20 transition-colors">
                        {/* Label */}
                        <td className="py-3.5 px-4 font-bold text-foreground">
                          <span className="font-['Space_Grotesk'] text-sm">{link.label}</span>
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-4">
                          {link.link_type === "company" ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                <Building2 className="size-3" />
                                Empresa
                              </span>
                              <span className="font-semibold text-foreground/90 truncate max-w-[160px]" title={link.customer?.name}>
                                {link.customer?.name ?? "Sin asignar"}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                              <Globe className="size-3" />
                              Público
                            </span>
                          )}
                        </td>

                        {/* Menu & Mode */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-foreground">{link.menu?.name ?? "Menú"}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="size-3" />
                                {menuScheduleLabel}
                              </span>
                              {isPast && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                  <AlertTriangle className="size-2.5" />
                                  Vencido
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Extras toggle badge */}
                        <td className="py-3.5 px-4 text-center">
                          {link.allow_extras ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              <Sparkles className="size-3" />
                              Extras Sí
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                              Extras No
                            </span>
                          )}
                        </td>

                        {/* Enabled state switch */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleEnabled(link)}
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                              link.enabled
                                ? "bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400"
                                : "bg-muted border-border text-muted-foreground"
                            }`}
                          >
                            {link.enabled ? "Activo" : "Inactivo"}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleCopyLink(link.token, link.label)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title="Copiar link"
                            >
                              {copiedToken === link.token ? (
                                <Check className="size-4 text-green-500" />
                              ) : (
                                <Copy className="size-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleOpenQr(link)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title="Ver código QR"
                            >
                              <QrCode className="size-4" />
                            </button>
                            <button
                              onClick={() => navigate(`/menu-links/menus/${link.menu_id}`)}
                              className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg border border-border hover:bg-accent text-foreground transition-colors cursor-pointer text-xs font-semibold"
                              title="Editar platos y días del menú"
                            >
                              <Edit3 className="size-3.5" />
                              Editar menú
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / Narrow Screen Cards View */}
            <div className="md:hidden flex flex-col gap-3">
              {filteredLinks.map((link) => {
                const isWeekly = link.menu?.schedule_mode === "weekly";
                const isPast = isWeekly && link.menu?.week_start ? isWeekPast(link.menu.week_start) : false;
                const menuScheduleLabel = isWeekly
                  ? link.menu?.week_start
                    ? formatWeekRange(link.menu.week_start)
                    : "Semanal"
                  : "Recurrente";

                return (
                  <div
                    key={link.id}
                    className="p-4 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold font-['Space_Grotesk'] text-base text-foreground leading-tight">
                          {link.label}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {link.link_type === "company" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              <Building2 className="size-3" />
                              {link.customer?.name ?? "Empresa"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                              <Globe className="size-3" />
                              Público
                            </span>
                          )}

                          {link.allow_extras && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              Extras Sí
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleEnabled(link)}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase transition-all cursor-pointer border ${
                          link.enabled
                            ? "bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400"
                            : "bg-muted border-border text-muted-foreground"
                        }`}
                      >
                        {link.enabled ? "Activo" : "Inactivo"}
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border flex flex-col gap-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Menú asignado:</span>
                        <span className="font-bold text-foreground">{link.menu?.name ?? "Menú"}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" />
                          Horario:
                        </span>
                        <span className="font-medium text-foreground">{menuScheduleLabel}</span>
                      </div>
                      {isPast && (
                        <div className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="size-3" />
                          Este menú semanal está vencido
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <button
                        onClick={() => handleCopyLink(link.token, link.label)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-border bg-muted/50 hover:bg-muted text-xs font-semibold text-foreground transition-colors cursor-pointer"
                      >
                        {copiedToken === link.token ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                        Copiar link
                      </button>
                      <button
                        onClick={() => handleOpenQr(link)}
                        className="p-2 rounded-xl border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors cursor-pointer"
                        title="Ver QR"
                      >
                        <QrCode className="size-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/menu-links/menus/${link.menu_id}`)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                      >
                        <Edit3 className="size-3.5" />
                        Editar menú
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* QR Modal */}
      <MenuQrModal
        open={qrModalState.open}
        onClose={() => setQrModalState((s) => ({ ...s, open: false }))}
        url={qrModalState.url}
        title={qrModalState.title}
      />

      {/* New Link Dialog */}
      <NewLinkDialog
        open={newLinkOpen}
        onClose={() => setNewLinkOpen(false)}
        tenantId={tenantId}
        sucursalId={sucursalId}
        menus={menus}
        onCreated={(newLink) => setLinks((prev) => [newLink, ...prev])}
        onRefreshMenus={async () => {
          const freshMenus = await fetchMenus(tenantId, sucursalId);
          setMenus(freshMenus);
        }}
      />
    </div>
  );
}
