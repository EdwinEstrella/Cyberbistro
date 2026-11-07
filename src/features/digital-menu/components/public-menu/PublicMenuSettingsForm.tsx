import React from "react";

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
  savingSettings: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function PublicMenuSettingsForm({
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
  savingSettings,
  onSubmit,
}: PublicMenuSettingsFormProps) {
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
