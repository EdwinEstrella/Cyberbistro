import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  type DigitalMenuSettings,
  savePublicMenuSettings,
  mapCalendarError,
} from "../../menu-links/lib/publicMenuCalendar";

export interface PublicMenuSettingsFormState {
  enabled: boolean;
  slug: string;
  title: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
}

export function createSettingsFormState(
  settings: DigitalMenuSettings | null,
  tenantId: string
): PublicMenuSettingsFormState {
  if (settings) {
    return {
      enabled: settings.enabled || false,
      slug: settings.public_slug || "",
      title: settings.title || "",
      description: settings.description || "",
      logoUrl: settings.logo_url || "",
      bannerUrl: settings.banner_url || "",
      accentColor: settings.theme?.accentColor || "#f97316",
    };
  }
  return {
    enabled: false,
    slug: tenantId ? `restaurante-${tenantId.slice(0, 8)}` : "",
    title: "",
    description: "",
    logoUrl: "",
    bannerUrl: "",
    accentColor: "#f97316",
  };
}

export interface UsePublicMenuSettingsParams {
  tenantId: string;
  sucursalId?: string | null;
  initialSettings: DigitalMenuSettings | null;
}

export function usePublicMenuSettings({
  tenantId,
  sucursalId,
  initialSettings,
}: UsePublicMenuSettingsParams) {
  const [settings, setSettings] = useState<DigitalMenuSettings | null>(initialSettings);
  const [form, setForm] = useState<PublicMenuSettingsFormState>(() =>
    createSettingsFormState(initialSettings, tenantId)
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettings(initialSettings);
    setForm(createSettingsFormState(initialSettings, tenantId));
  }, [initialSettings, tenantId]);

  const updateField = useCallback(
    <K extends keyof PublicMenuSettingsFormState>(
      field: K,
      value: PublicMenuSettingsFormState[K]
    ) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const menuId = settings?.menu_id ?? null;

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tenantId) return;

    const resolvedSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
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
        enabled: form.enabled,
        publicSlug: resolvedSlug,
        title: form.title,
        description: form.description,
        logoUrl: form.logoUrl,
        bannerUrl: form.bannerUrl,
        accentColor: form.accentColor,
      });

      setSettings(updated);
      toast.success("Configuración del menú público guardada exitosamente.");
      return updated;
    } catch (err: unknown) {
      const msg = mapCalendarError(err);
      toast.error(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  return {
    settings,
    setSettings,
    form,
    updateField,
    menuId,
    savingSettings,
    handleSaveSettings,
  };
}
