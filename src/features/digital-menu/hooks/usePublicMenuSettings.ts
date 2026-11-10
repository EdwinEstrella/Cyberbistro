import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  type DigitalMenuSettings,
  type PublicContact,
  savePublicMenuSettings,
  mapCalendarError,
} from "../../menu-links/lib/publicMenuCalendar";
import { normalizePublicContact } from "../lib/publicContact";

export interface PublicMenuSettingsFormState {
  enabled: boolean;
  slug: string;
  title: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  wifi_name: string;
  wifi_password: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  google_review_url: string;
  maps_url: string;
  suggestion_email: string;
}

export function createSettingsFormState(
  settings: DigitalMenuSettings | null,
  tenantId: string
): PublicMenuSettingsFormState {
  const contact = settings?.public_contact || {};
  if (settings) {
    return {
      enabled: settings.enabled || false,
      slug: settings.public_slug || "",
      title: settings.title || "",
      description: settings.description || "",
      logoUrl: settings.logo_url || "",
      bannerUrl: settings.banner_url || "",
      accentColor: settings.theme?.accentColor || "#f97316",
      wifi_name: contact.wifi_name || "",
      wifi_password: contact.wifi_password || "",
      whatsapp: contact.whatsapp || "",
      instagram: contact.instagram || "",
      facebook: contact.facebook || "",
      tiktok: contact.tiktok || "",
      google_review_url: contact.google_review_url || "",
      maps_url: contact.maps_url || "",
      suggestion_email: contact.suggestion_email || "",
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
    wifi_name: "",
    wifi_password: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    google_review_url: "",
    maps_url: "",
    suggestion_email: "",
  };
}

export function extractPublicContactFromForm(form: PublicMenuSettingsFormState): PublicContact {
  return {
    wifi_name: form.wifi_name,
    wifi_password: form.wifi_password,
    whatsapp: form.whatsapp,
    instagram: form.instagram,
    facebook: form.facebook,
    tiktok: form.tiktok,
    google_review_url: form.google_review_url,
    maps_url: form.maps_url,
    suggestion_email: form.suggestion_email,
  };
}

export function validatePublicMenuSettingsForm(form: PublicMenuSettingsFormState): {
  valid: boolean;
  resolvedSlug: string;
  normalizedContact: PublicContact;
  slugError?: string;
  contactErrors: Partial<Record<keyof PublicContact, string>>;
  firstError?: string;
} {
  const resolvedSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!resolvedSlug) {
    return {
      valid: false,
      resolvedSlug: "",
      normalizedContact: {},
      slugError: "El slug público es obligatorio.",
      contactErrors: {},
      firstError: "El slug público es obligatorio.",
    };
  }

  const rawContact = extractPublicContactFromForm(form);
  const { value: normalizedContact, errors } = normalizePublicContact(rawContact);
  const errorKeys = Object.keys(errors) as (keyof PublicContact)[];
  if (errorKeys.length > 0) {
    return {
      valid: false,
      resolvedSlug,
      normalizedContact,
      contactErrors: errors,
      firstError: errors[errorKeys[0]],
    };
  }

  return {
    valid: true,
    resolvedSlug,
    normalizedContact,
    contactErrors: {},
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
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof PublicContact, string>>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettings(initialSettings);
    setForm(createSettingsFormState(initialSettings, tenantId));
    setContactErrors({});
  }, [initialSettings, tenantId]);

  const updateField = useCallback(
    <K extends keyof PublicMenuSettingsFormState>(
      field: K,
      value: PublicMenuSettingsFormState[K]
    ) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setContactErrors((prev) => {
        if (!prev[field as unknown as keyof PublicContact]) return prev;
        const next = { ...prev };
        delete next[field as unknown as keyof PublicContact];
        return next;
      });
    },
    []
  );

  const menuId = settings?.menu_id ?? null;

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tenantId) return;

    const validation = validatePublicMenuSettingsForm(form);
    if (!validation.valid) {
      if (validation.firstError) {
        toast.error(validation.firstError);
      }
      setContactErrors(validation.contactErrors);
      return;
    }
    setContactErrors({});

    try {
      setSavingSettings(true);
      const updated = await savePublicMenuSettings({
        tenantId,
        sucursalId,
        existingSettings: settings,
        enabled: form.enabled,
        publicSlug: validation.resolvedSlug,
        title: form.title,
        description: form.description,
        logoUrl: form.logoUrl,
        bannerUrl: form.bannerUrl,
        accentColor: form.accentColor,
        publicContact: validation.normalizedContact,
      });

      setSettings(updated);
      setForm(createSettingsFormState(updated, tenantId));
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
    contactErrors,
    setContactErrors,
    menuId,
    savingSettings,
    handleSaveSettings,
  };
}
