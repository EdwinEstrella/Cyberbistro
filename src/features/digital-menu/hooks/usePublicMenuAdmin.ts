import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import { enqueueLocalWrite, getDeviceId, readLocalMirror } from "../../../shared/lib/localFirst";
import type { Menu } from "../../menu-links/lib/types";
import { fetchMenus, createMenu } from "../../menu-links/lib/menuLinksRepo";
import { getMondayOfWeek } from "../../menu-links/lib/menuSchedule";
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

export interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
  is_extra?: boolean;
  sucursal_id?: string | null;
}

export interface DigitalMenuItem {
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

export interface UsePublicMenuAdminParams {
  tenantId: string;
  sucursalId?: string | null;
}

export function usePublicMenuAdmin({ tenantId, sucursalId }: UsePublicMenuAdminParams) {
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

  const handleEditCalendar = (menuToEditId: string) => {
    navigate(`/menu-links/menus/${menuToEditId}`);
  };

  const handleOpenCreateMenu = () => {
    if (!settings?.id) {
      toast.error("Guarda primero la configuración del menú público antes de asignar un calendario.");
      return;
    }
    setShowCreateMenu(true);
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

  return {
    // Basic settings
    settings,
    enabled,
    setEnabled,
    slug,
    setSlug,
    title,
    setTitle,
    description,
    setDescription,
    logoUrl,
    setLogoUrl,
    bannerUrl,
    setBannerUrl,
    accentColor,
    setAccentColor,
    menuId,
    savingSettings,
    handleSaveSettings,

    // Menus & calendar
    menus,
    selectedCalendarMenuId,
    setSelectedCalendarMenuId,
    assignedMenu,
    updatingCalendar,
    handleAssignCalendar,
    handleRemoveCalendar,
    handleEditCalendar,

    // Inline menu creation
    showCreateMenu,
    setShowCreateMenu,
    handleOpenCreateMenu,
    newMenuName,
    setNewMenuName,
    newMenuMode,
    setNewMenuMode,
    newMenuWeekStart,
    setNewMenuWeekStart,
    creatingMenu,
    handleCreateAndAssignMenu,

    // Platos list & custom fields
    platos,
    menuItems,
    dishSearch,
    setDishSearch,
    filteredPlatosList,
    handleToggleDishVisibility,
    handleOpenEditPlato,

    // Edit plato dialog
    editingPlato,
    setEditingPlato,
    editDisplayName,
    setEditDisplayName,
    editDescription,
    setEditDescription,
    editImageUrl,
    uploadingImage,
    handleImageUpload,
    handleUpdateDishCustomFields,

    // QR & Share
    resolvedSlug,
    qrUrl,
    qrCodeDataUrl,
    copiedLink,
    handleCopyLink,
    handleDownloadQR,

    // General UI
    loading,
    loadData,
  };
}
