import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import {
  ExternalLink,
  QrCode,
  Copy,
  Check,
  Calendar as CalendarIcon,
  Plus,
  Edit3,
  X,
  AlertTriangle,
  Search,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import { enqueueLocalWrite, getDeviceId, readLocalMirror } from "../../../shared/lib/localFirst";
import { DatePicker } from "../../../shared/ui/date-picker";
import type { Menu } from "../../menu-links/lib/types";
import { fetchMenus, createMenu } from "../../menu-links/lib/menuLinksRepo";
import { getMondayOfWeek, formatWeekRange, isWeekPast } from "../../menu-links/lib/menuSchedule";
import { getBusinessToday } from "../../menu-links/lib/menuBusinessDate";
import { buildPublicMenuUrl } from "../../menu-links/lib/menuLinkUrl";
import {
  type DigitalMenuSettings,
  assignPublicMenuCalendar,
  removePublicMenuCalendar,
  savePublicMenuSettings,
  mapCalendarError,
  pickPublicMenuSettings,
} from "../../menu-links/lib/publicMenuCalendar";

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
  is_extra?: boolean;
  sucursal_id?: string | null;
}

interface DigitalMenuItem {
  id: string;
  tenant_id: string;
  plato_id: number;
  visible: boolean;
  display_name?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
  updated_at?: string;
}

interface PublicMenuAdminCardProps {
  tenantId: string;
  sucursalId?: string | null;
}

export function PublicMenuAdminCard({ tenantId, sucursalId }: PublicMenuAdminCardProps) {
  const navigate = useNavigate();

  // Settings state
  const [settings, setSettings] = useState<DigitalMenuSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#f97316");
  const [menuId, setMenuId] = useState<string | null>(null);

  // Tenant menus list for calendar assignment
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedCalendarMenuId, setSelectedCalendarMenuId] = useState<string>("");

  // Inline menu creation
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuMode, setNewMenuMode] = useState<"recurring" | "weekly">("recurring");
  const [newMenuWeekStart, setNewMenuWeekStart] = useState<string>(
    getMondayOfWeek(getBusinessToday())
  );
  const [creatingMenu, setCreatingMenu] = useState(false);

  // Platos & legacy items
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuItems, setMenuItems] = useState<DigitalMenuItem[]>([]);
  const [dishSearch, setDishSearch] = useState("");

  // Dish customization dialog
  const [editingPlato, setEditingPlato] = useState<Plato | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingCalendar, setUpdatingCalendar] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  // Load all initial data
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);

      const [platosLocal, settingsLocal, itemsLocal, tenantMenus] = await Promise.all([
        readLocalMirror<Plato>(tenantId, "platos").catch(() => []),
        readLocalMirror<DigitalMenuSettings>(tenantId, "digital_menu_settings").catch(() => []),
        readLocalMirror<DigitalMenuItem>(tenantId, "digital_menu_items").catch(() => []),
        fetchMenus(tenantId, sucursalId).catch(() => []),
      ]);

      const filteredPlatos = platosLocal.filter(
        (p) => !p.sucursal_id || p.sucursal_id === sucursalId
      );
      setPlatos(filteredPlatos);
      setMenus(tenantMenus);

      let tenantSettings = pickPublicMenuSettings(settingsLocal, tenantId, sucursalId);

      // If not in local mirror, try direct fetch from cloud
      if (!tenantSettings && (typeof navigator === "undefined" || navigator.onLine)) {
        let query = supabase
          .from("digital_menu_settings")
          .select("*")
          .eq("tenant_id", tenantId);

        if (sucursalId) {
          query = query.or(`sucursal_id.is.null,sucursal_id.eq.${sucursalId}`);
        } else {
          query = query.is("sucursal_id", null);
        }

        const { data } = await query;
        if (data && data.length > 0) {
          tenantSettings = pickPublicMenuSettings(data as DigitalMenuSettings[], tenantId, sucursalId);
        }
      }

      if (tenantSettings) {
        setSettings(tenantSettings);
        setEnabled(tenantSettings.enabled || false);
        setSlug(tenantSettings.public_slug || "");
        setTitle(tenantSettings.title || "");
        setDescription(tenantSettings.description || "");
        setLogoUrl(tenantSettings.logo_url || "");
        setBannerUrl(tenantSettings.banner_url || "");
        setAccentColor(tenantSettings.theme?.accentColor || "#f97316");
        setMenuId(tenantSettings.menu_id || null);
        if (tenantSettings.menu_id) {
          setSelectedCalendarMenuId(tenantSettings.menu_id);
        } else if (tenantMenus.length > 0) {
          setSelectedCalendarMenuId(tenantMenus[0].id);
        }
      } else {
        const defaultSlug = `restaurante-${tenantId.slice(0, 8)}`;
        setSlug(defaultSlug);
        if (tenantMenus.length > 0) {
          setSelectedCalendarMenuId(tenantMenus[0].id);
        }
      }

      setMenuItems(itemsLocal.filter((mi) => mi.tenant_id === tenantId));
    } catch (err) {
      console.error("Error loading public menu admin data:", err);
      toast.error("No se pudo cargar la configuración del menú público.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, sucursalId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // QR URL calculation
  const resolvedSlug = useMemo(
    () => slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""),
    [slug]
  );
  const qrUrl = useMemo(
    () => buildPublicMenuUrl(resolvedSlug),
    [resolvedSlug]
  );

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 256, margin: 2 })
      .then((url: string) => setQrCodeDataUrl(url))
      .catch((err: unknown) => console.error("Error generating QR:", err));
  }, [qrUrl]);

  // Assigned menu details
  const assignedMenu = useMemo(
    () => menus.find((m) => m.id === menuId),
    [menus, menuId]
  );

  // Save basic public menu settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!resolvedSlug) {
      toast.error("El slug público es obligatorio.");
      return;
    }

    try {
      setSavingSettings(true);
      const updated = await savePublicMenuSettings({
        tenantId,
        sucursalId,
        existingSettings: settings,
        enabled,
        publicSlug: resolvedSlug,
        title,
        description,
        logoUrl,
        bannerUrl,
        accentColor,
      });

      setSettings(updated);
      toast.success("Configuración del menú público guardada exitosamente.");
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  // Assign existing calendar menu
  const handleAssignCalendar = async () => {
    if (!tenantId || !selectedCalendarMenuId) return;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }

    try {
      setUpdatingCalendar(true);
      const updated = await assignPublicMenuCalendar(
        tenantId,
        sucursalId,
        selectedCalendarMenuId,
        settings
      );
      setSettings(updated);
      setMenuId(updated.menu_id);
      toast.success("Calendario asignado al menú público con éxito.");
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setUpdatingCalendar(false);
    }
  };

  // Remove calendar menu
  const handleRemoveCalendar = async () => {
    if (!tenantId) return;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }

    try {
      setUpdatingCalendar(true);
      const updated = await removePublicMenuCalendar(tenantId, sucursalId, settings);
      setSettings(updated);
      setMenuId(null);
      toast.success(
        "Calendario quitado. El menú público mostrará la lista de platos visibles."
      );
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setUpdatingCalendar(false);
    }
  };

  // Create new menu inline and assign as calendar
  const handleCreateAndAssignMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }

    if (!newMenuName.trim()) {
      toast.error("El nombre del nuevo menú es obligatorio.");
      return;
    }

    try {
      setCreatingMenu(true);
      const created = await createMenu({
        tenantId,
        sucursalId,
        name: newMenuName.trim(),
        scheduleMode: newMenuMode,
        weekStart: newMenuMode === "weekly" ? newMenuWeekStart : null,
      });

      // Refresh menus list
      const freshMenus = await fetchMenus(tenantId, sucursalId);
      setMenus(freshMenus);
      setSelectedCalendarMenuId(created.id);

      // Assign to public menu
      const updated = await assignPublicMenuCalendar(tenantId, sucursalId, created.id, settings);
      setSettings(updated);
      setMenuId(updated.menu_id);

      setShowCreateMenu(false);
      setNewMenuName("");
      toast.success(`Menú "${created.name}" creado y asignado como calendario público.`);
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setCreatingMenu(false);
    }
  };

  // Toggle dish visibility in legacy list
  const handleToggleDishVisibility = async (platoId: number, visible: boolean) => {
    if (!tenantId) return;

    try {
      const existingItem = menuItems.find((mi) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload: DigitalMenuItem = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible,
        display_name: existingItem?.display_name || null,
        description: existingItem?.description || null,
        image_url: existingItem?.image_url || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString(),
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload: payload as unknown as Record<string, unknown>,
        deviceId: await getDeviceId(),
      });

      setMenuItems((prev) => {
        const other = prev.filter((mi) => mi.plato_id !== platoId);
        return [...other, payload];
      });
    } catch (err) {
      console.error("Error updating dish visibility:", err);
      toast.error("No se pudo actualizar la visibilidad del plato.");
    }
  };

  // Save dish custom fields in legacy list
  const handleUpdateDishCustomFields = async () => {
    if (!tenantId || !editingPlato) return;

    try {
      const platoId = editingPlato.id;
      const existingItem = menuItems.find((mi) => mi.plato_id === platoId);
      const itemId = existingItem?.id || crypto.randomUUID();

      const payload: DigitalMenuItem = {
        id: itemId,
        tenant_id: tenantId,
        plato_id: platoId,
        visible: existingItem ? existingItem.visible : true,
        display_name: editDisplayName.trim() || null,
        description: editDescription.trim() || null,
        image_url: editImageUrl.trim() || null,
        sort_order: existingItem?.sort_order || 0,
        updated_at: new Date().toISOString(),
      };

      await enqueueLocalWrite({
        tenantId,
        tableName: "digital_menu_items",
        rowId: itemId,
        op: existingItem ? "update" : "insert",
        payload: payload as unknown as Record<string, unknown>,
        deviceId: await getDeviceId(),
      });

      setMenuItems((prev) => {
        const other = prev.filter((mi) => mi.plato_id !== platoId);
        return [...other, payload];
      });

      toast.success(`Plato "${editingPlato.nombre}" personalizado.`);
      setEditingPlato(null);
    } catch (err) {
      console.error("Error updating plate custom fields:", err);
      toast.error("No se pudo guardar la personalización del plato.");
    }
  };

  const handleOpenEditPlato = (plato: Plato) => {
    const custom = menuItems.find((mi) => mi.plato_id === plato.id);
    setEditingPlato(plato);
    setEditDisplayName(custom?.display_name || plato.nombre);
    setEditDescription(custom?.description || "");
    setEditImageUrl(custom?.image_url || "");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !editingPlato) return;
    const file = e.target.files[0];

    setUploadingImage(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${tenantId}/platos/${editingPlato.id}-${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage.from("configuracion").upload(fileName, file);

      if (error) {
        toast.error(`Error al subir la imagen: ${error.message}`);
        return;
      }

      const { data } = supabase.storage.from("configuracion").getPublicUrl(fileName);
      setEditImageUrl(data.publicUrl);
    } catch {
      toast.error("Error inesperado al subir la imagen");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopiedLink(true);
      toast.success("Enlace público copiado al portapapeles");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const handleDownloadQR = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `qr-menu-${resolvedSlug || "azokia"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredPlatosList = useMemo(() => {
    return platos.filter((p) => {
      const term = dishSearch.toLowerCase().trim();
      if (!term) return true;
      return (
        p.nombre.toLowerCase().includes(term) ||
        (p.categoria && p.categoria.toLowerCase().includes(term))
      );
    });
  }, [platos, dishSearch]);

  if (loading) {
    return (
      <div className="p-8 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <span className="text-xs font-semibold font-['Space_Grotesk']">
          Cargando configuración del menú público...
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4 sm:p-6 flex flex-col gap-6">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-foreground tracking-tight">
              Menú público
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Profesional+
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configuración general, enlace web, código QR y calendario de platos para clientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Recargar datos"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {/* Grid: Left Column (Settings & QR) and Right Column (Calendar & Legacy Dishes) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): General Form & QR */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* General Config Form */}
          <div className="p-5 rounded-2xl border border-border bg-muted/20 flex flex-col gap-4">
            <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground">
              Datos del Menú Público
            </h3>

            <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Activar Menú Digital</span>
                  <span className="text-[11px] text-muted-foreground">
                    Permite que los clientes vean el menú y hagan pedidos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-5 rounded accent-primary cursor-pointer"
                />
              </div>

              {/* Slug */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Enlace del Restaurante (Slug)
                </label>
                <div className="flex items-center bg-muted/70 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
                  <span className="select-none opacity-60 shrink-0">#/menu/</span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="mi-restaurante"
                    className="bg-transparent border-none text-foreground w-full focus:outline-none ml-1 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Título Público
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Cyberbistro Central"
                  className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Descripción del Negocio
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Las mejores hamburguesas y comida gourmet..."
                  className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Logo URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  URL del Logo (opcional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://ejemplo.com/logo.png"
                  className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              {/* Banner URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  URL del Banner (opcional)
                </label>
                <input
                  type="url"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://ejemplo.com/banner.jpg"
                  className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={savingSettings}
                className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 font-bold uppercase text-[11px] tracking-wider hover:opacity-95 transition-all cursor-pointer shadow-sm disabled:opacity-50 mt-1"
              >
                {savingSettings ? "Guardando..." : "Guardar Configuración"}
              </button>
            </form>
          </div>

          {/* QR & Share Card */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col items-center text-center gap-3">
            <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground self-start">
              Código QR y Enlace Público
            </h3>

            {qrCodeDataUrl ? (
              <div className="bg-white p-3 rounded-2xl border border-black/10 flex items-center justify-center shadow-inner my-1">
                <img src={qrCodeDataUrl} alt="Código QR del Menú" className="w-40 h-40 object-contain" />
              </div>
            ) : (
              <div className="w-40 h-40 rounded-2xl bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">
                Generando QR...
              </div>
            )}

            <div className="flex flex-col gap-1 w-full text-center">
              <span className="text-xs font-semibold text-primary break-all font-mono">
                {qrUrl}
              </span>
              <p className="text-[11px] text-muted-foreground">
                Escanea o comparte este enlace para acceder directamente al menú público.
              </p>
            </div>

            <div className="flex gap-2 w-full mt-1">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground py-2 px-3 rounded-xl font-bold text-xs border border-border cursor-pointer transition-colors"
              >
                {copiedLink ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                Copiar Enlace
              </button>
              <button
                type="button"
                onClick={handleDownloadQR}
                className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground py-2 px-3 rounded-xl font-bold text-xs cursor-pointer hover:opacity-90 transition-all shadow-sm"
              >
                <QrCode className="size-3.5" />
                Descargar QR
              </button>
            </div>

            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `¡Hola! Acá te comparto nuestro menú digital:\n${qrUrl}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-[#25D366]/10 text-[#25D366] font-bold py-2 rounded-xl hover:bg-[#25D366]/20 transition-colors cursor-pointer text-xs mt-1"
            >
              <ExternalLink className="size-3.5" />
              Compartir Menú por WhatsApp
            </a>
          </div>
        </div>

        {/* Right Column (7 cols): Calendar & Legacy Dish Management */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Calendar Management Card */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="size-4 text-primary" />
                  <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
                    Calendario del Menú Público
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Asigna un menú por días (recurrente o semanal) para que la carta se actualice automáticamente según el día de hoy.
                </p>
              </div>

              {assignedMenu && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 shrink-0">
                  <CheckCircle2 className="size-3.5" />
                  Calendario Activo
                </span>
              )}
            </div>

            {/* If a calendar menu is currently assigned */}
            {assignedMenu ? (
              <div className="p-4 rounded-xl bg-muted/40 border border-border flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">
                      {assignedMenu.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarIcon className="size-3 text-muted-foreground" />
                        {assignedMenu.schedule_mode === "weekly"
                          ? assignedMenu.week_start
                            ? formatWeekRange(assignedMenu.week_start)
                            : "Semanal"
                          : "Recurrente semanal"}
                      </span>
                      {assignedMenu.schedule_mode === "weekly" &&
                        assignedMenu.week_start &&
                        isWeekPast(assignedMenu.week_start) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <AlertTriangle className="size-3" />
                            Semana vencida
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/menu-links/menus/${assignedMenu.id}`)}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                    >
                      <Edit3 className="size-3.5" />
                      Editar calendario
                    </button>
                    <button
                      type="button"
                      disabled={updatingCalendar || !settings?.id}
                      onClick={handleRemoveCalendar}
                      className="py-1.5 px-3 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-destructive text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!settings?.id ? "Guarda primero la configuración del menú público antes de asignar un calendario." : "Volver a la lista de platos tradicional"}
                    >
                      Quitar calendario
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs">
                  <p>
                    El menú público muestra hoy los platos programados en <strong>{assignedMenu.name}</strong> para el día actual.
                    Si quitas el calendario, el menú público volverá a mostrar la lista completa de platos visibles configurados abajo.
                  </p>
                </div>
              </div>
            ) : (
              /* No calendar menu assigned */
              <div className="flex flex-col gap-3">
                {!settings?.id ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs leading-relaxed">
                    <span className="font-bold">Aviso:</span> Guarda primero la configuración del menú público antes de asignar un calendario.
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs leading-relaxed">
                    <span className="font-bold">Modo lista visible:</span> Sin un calendario asignado, el menú público muestra la lista completa de platos visibles configurados abajo.
                  </div>
                )}

                {/* Switch between select existing or create new menu */}
                <div className="flex flex-col gap-3 mt-1">
                  {!showCreateMenu ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={selectedCalendarMenuId}
                        onChange={(e) => setSelectedCalendarMenuId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                      >
                        {menus.length === 0 ? (
                          <option value="">No hay menús creados</option>
                        ) : (
                          menus.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.schedule_mode === "weekly" ? "Semanal" : "Recurrente"})
                            </option>
                          ))
                        )}
                      </select>

                      <button
                        type="button"
                        disabled={updatingCalendar || !selectedCalendarMenuId || menus.length === 0 || !settings?.id}
                        onClick={handleAssignCalendar}
                        title={!settings?.id ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
                        className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-95 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm shrink-0"
                      >
                        {updatingCalendar ? "Asignando..." : "Asignar calendario"}
                      </button>

                      <button
                        type="button"
                        disabled={!settings?.id}
                        onClick={() => {
                          if (!settings?.id) {
                            toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
                            return;
                          }
                          setShowCreateMenu(true);
                        }}
                        title={!settings?.id ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
                        className="py-2 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="size-3.5" />
                        Crear menú
                      </button>
                    </div>
                  ) : (
                    /* Inline menu creation flow */
                    <form
                      onSubmit={handleCreateAndAssignMenu}
                      className="p-4 rounded-xl border border-border bg-muted/30 flex flex-col gap-3 animate-in fade-in duration-150"
                    >
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <h4 className="font-bold text-xs text-foreground uppercase tracking-wider">
                          Crear nuevo menú para calendario
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowCreateMenu(false)}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-muted-foreground">
                          Nombre del menú
                        </label>
                        <input
                          type="text"
                          required
                          value={newMenuName}
                          onChange={(e) => setNewMenuName(e.target.value)}
                          placeholder="Ej. Menú Ejecutivo Semanal"
                          className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-muted-foreground">
                          Tipo de horario
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewMenuMode("recurring")}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              newMenuMode === "recurring"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Recurrente semanal
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewMenuMode("weekly")}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              newMenuMode === "weekly"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Semana específica
                          </button>
                        </div>
                      </div>

                      {newMenuMode === "weekly" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-muted-foreground">
                            Fecha de inicio de semana (normalizada a lunes)
                          </label>
                          <DatePicker
                            value={newMenuWeekStart}
                            onChange={(date) =>
                              setNewMenuWeekStart(date ? getMondayOfWeek(date) : "")
                            }
                            placeholder="Seleccionar lunes"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                        <button
                          type="button"
                          onClick={() => setShowCreateMenu(false)}
                          className="py-1.5 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={creatingMenu || !settings?.id}
                          title={!settings?.id ? "Guarda primero la configuración del menú público antes de asignar un calendario." : undefined}
                          className="py-1.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                        >
                          {creatingMenu ? "Creando..." : "Crear y asignar"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Legacy Dish Visibility Management ("Carta de Platos en Web") */}
          <div className="p-5 rounded-2xl border border-border bg-card shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
                  Carta de Platos en Web (Lista Tradicional)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {assignedMenu
                    ? "Control de visibilidad y personalizaciones de platos (activo si se remueve el calendario)."
                    : "Controlá qué platos son visibles en internet y personalizá sus fotos y descripciones públicas."}
                </p>
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar plato o categoría..."
                  value={dishSearch}
                  onChange={(e) => setDishSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground uppercase font-bold tracking-wider text-[10px] sticky top-0 bg-card z-10">
                    <th className="py-2.5 pl-3">Plato</th>
                    <th className="py-2.5">Categoría</th>
                    <th className="py-2.5 text-right">Precio</th>
                    <th className="py-2.5 text-center">Visible</th>
                    <th className="py-2.5 text-center pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPlatosList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground text-xs">
                        No se encontraron platos para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filteredPlatosList.map((plato) => {
                      const custom = menuItems.find((mi) => mi.plato_id === plato.id);
                      const isVisible = custom ? custom.visible : plato.disponible;
                      const isCustomized =
                        custom &&
                        (custom.display_name || custom.description || custom.image_url);

                      return (
                        <tr key={plato.id} className="hover:bg-muted/15 transition-colors">
                          <td className="py-2.5 pl-3 font-semibold">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-foreground truncate max-w-[200px]">
                                {custom?.display_name || plato.nombre}
                              </span>
                              {isCustomized && (
                                <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                                  <Sparkles className="size-2.5" />
                                  Personalizado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{plato.categoria}</td>
                          <td className="py-2.5 text-right font-bold text-foreground">
                            {new Intl.NumberFormat("es-DO", {
                              style: "currency",
                              currency: "DOP",
                            }).format(plato.precio)}
                          </td>
                          <td className="py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={(e) =>
                                handleToggleDishVisibility(plato.id, e.target.checked)
                              }
                              className="size-4 rounded accent-primary cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 text-center pr-3">
                            <button
                              type="button"
                              onClick={() => handleOpenEditPlato(plato)}
                              className="bg-muted hover:bg-muted-foreground/15 text-foreground px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              Personalizar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Dish Customization Modal */}
      {editingPlato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl border border-border p-6 max-w-md w-full shadow-2xl flex flex-col gap-5 text-card-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-['Space_Grotesk'] text-base font-bold text-foreground">
                  Personalizar Plato en Web
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Modifica los datos que verán los clientes en el menú digital.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlato(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Nombre Público
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder={editingPlato.nombre}
                  className="w-full px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Descripción del Plato
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Detalla los ingredientes o modo de preparación..."
                  className="w-full px-3 py-2 rounded-xl bg-muted/60 border border-border text-foreground text-xs focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Foto del Plato
                </label>
                <div className="flex items-center gap-3">
                  {editImageUrl && (
                    <img
                      src={editImageUrl}
                      alt="Vista previa"
                      className="w-14 h-14 object-cover rounded-xl border border-border shadow-sm shrink-0 bg-muted"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  />
                  {uploadingImage && (
                    <span className="text-xs text-muted-foreground animate-pulse">Subiendo...</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingPlato(null)}
                className="py-2 px-3.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateDishCustomFields}
                className="py-2 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                Guardar Personalización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
