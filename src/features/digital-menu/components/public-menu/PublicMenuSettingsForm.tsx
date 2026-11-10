import type { FormEvent } from "react";
import type { PublicContact } from "../../../menu-links/lib/publicMenuCalendar";
import { ContactField } from "./ContactField";

export interface PublicMenuSettingsFormProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  logoUrl: string;
  onLogoUrlChange: (logoUrl: string) => void;
  bannerUrl: string;
  onBannerUrlChange: (bannerUrl: string) => void;
  // Contact fields (camelCase only, all required, no aliases)
  wifiName: string;
  onWifiNameChange: (val: string) => void;
  wifiPassword: string;
  onWifiPasswordChange: (val: string) => void;
  whatsapp: string;
  onWhatsappChange: (val: string) => void;
  instagram: string;
  onInstagramChange: (val: string) => void;
  facebook: string;
  onFacebookChange: (val: string) => void;
  tiktok: string;
  onTiktokChange: (val: string) => void;
  googleReviewUrl: string;
  onGoogleReviewUrlChange: (val: string) => void;
  mapsUrl: string;
  onMapsUrlChange: (val: string) => void;
  suggestionEmail: string;
  onSuggestionEmailChange: (val: string) => void;
  contactErrors?: Partial<Record<keyof PublicContact, string>>;
  savingSettings: boolean;
  onSubmit: (e: FormEvent) => void;
}

interface ContactFieldConfig {
  valueKey: keyof Pick<
    PublicMenuSettingsFormProps,
    | "wifiName"
    | "wifiPassword"
    | "whatsapp"
    | "instagram"
    | "facebook"
    | "tiktok"
    | "googleReviewUrl"
    | "mapsUrl"
    | "suggestionEmail"
  >;
  changeKey: keyof Pick<
    PublicMenuSettingsFormProps,
    | "onWifiNameChange"
    | "onWifiPasswordChange"
    | "onWhatsappChange"
    | "onInstagramChange"
    | "onFacebookChange"
    | "onTiktokChange"
    | "onGoogleReviewUrlChange"
    | "onMapsUrlChange"
    | "onSuggestionEmailChange"
  >;
  errorKey: keyof PublicContact;
  label: string;
  placeholder: string;
  type?: "text" | "tel" | "url" | "email";
  maxLength?: number;
  autoComplete?: string;
  helperText?: string;
}

const contactFieldConfigs: ContactFieldConfig[] = [
  {
    valueKey: "wifiName",
    changeKey: "onWifiNameChange",
    errorKey: "wifi_name",
    label: "Nombre del WiFi",
    placeholder: "Ej. CyberBistro_Clientes",
    maxLength: 64,
    type: "text",
  },
  {
    valueKey: "wifiPassword",
    changeKey: "onWifiPasswordChange",
    errorKey: "wifi_password",
    label: "Clave del WiFi",
    placeholder: "Clave para que los comensales se conecten",
    maxLength: 128,
    type: "text",
    autoComplete: "off",
  },
  {
    valueKey: "whatsapp",
    changeKey: "onWhatsappChange",
    errorKey: "whatsapp",
    label: "WhatsApp (con código de país)",
    placeholder: "Ej. +1 809 555 0199",
    type: "tel",
  },
  {
    valueKey: "instagram",
    changeKey: "onInstagramChange",
    errorKey: "instagram",
    label: "Instagram",
    placeholder: "@tu_restaurante o enlace https://",
    type: "text",
  },
  {
    valueKey: "facebook",
    changeKey: "onFacebookChange",
    errorKey: "facebook",
    label: "Facebook",
    placeholder: "@tu_restaurante o enlace https://",
    type: "text",
  },
  {
    valueKey: "tiktok",
    changeKey: "onTiktokChange",
    errorKey: "tiktok",
    label: "TikTok",
    placeholder: "@tu_restaurante o enlace https://",
    type: "text",
  },
  {
    valueKey: "googleReviewUrl",
    changeKey: "onGoogleReviewUrlChange",
    errorKey: "google_review_url",
    label: "Enlace para calificarnos en Google",
    placeholder: "https://g.page/r/.../review",
    type: "url",
  },
  {
    valueKey: "mapsUrl",
    changeKey: "onMapsUrlChange",
    errorKey: "maps_url",
    label: "Enlace de Google Maps (cómo llegar)",
    placeholder: "https://maps.google.com/?q=...",
    type: "url",
  },
  {
    valueKey: "suggestionEmail",
    changeKey: "onSuggestionEmailChange",
    errorKey: "suggestion_email",
    label: "Correo para recibir sugerencias",
    placeholder: "sugerencias@mirestaurante.com",
    maxLength: 254,
    type: "email",
    autoComplete: "off",
    helperText:
      "Si lo dejás vacío, las sugerencias se guardan en el sistema pero no se envían por correo.",
  },
];

export function PublicMenuSettingsForm(props: PublicMenuSettingsFormProps) {
  const {
    enabled,
    onEnabledChange,
    slug,
    onSlugChange,
    title,
    onTitleChange,
    description,
    onDescriptionChange,
    logoUrl,
    onLogoUrlChange,
    bannerUrl,
    onBannerUrlChange,
    contactErrors = {},
    savingSettings,
    onSubmit,
  } = props;

  return (
    <div className="p-5 rounded-2xl border border-border bg-muted/20 flex flex-col gap-4">
      <h3 className="font-['Space_Grotesk'] text-sm font-bold text-foreground">
        Datos del Menú Público
      </h3>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            onChange={(e) => onEnabledChange(e.target.checked)}
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
              onChange={(e) => onSlugChange(e.target.value)}
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
            onChange={(e) => onTitleChange(e.target.value)}
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
            onChange={(e) => onDescriptionChange(e.target.value)}
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
            onChange={(e) => onLogoUrlChange(e.target.value)}
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
            onChange={(e) => onBannerUrlChange(e.target.value)}
            placeholder="https://ejemplo.com/banner.jpg"
            className="w-full px-3 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs focus:outline-none focus:border-primary"
          />
        </div>

        {/* Section: Información para tus clientes */}
        <div className="pt-3 border-t border-border/50 flex flex-col gap-3">
          <div>
            <h4 className="font-['Space_Grotesk'] text-xs font-bold text-foreground">
              Información para tus clientes
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Datos de contacto, redes sociales y accesos directos visibles en el menú público.
            </p>
          </div>

          {contactFieldConfigs.map((cfg) => {
            const val = props[cfg.valueKey];
            const onChange = props[cfg.changeKey];
            const err = contactErrors[cfg.errorKey];

            return (
              <ContactField
                key={cfg.valueKey}
                label={cfg.label}
                value={val}
                onChange={onChange}
                placeholder={cfg.placeholder}
                type={cfg.type}
                maxLength={cfg.maxLength}
                autoComplete={cfg.autoComplete}
                helperText={cfg.helperText}
                error={err}
              />
            );
          })}
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
  );
}
