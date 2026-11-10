export const DEFAULT_PRODUCTION_WEB_ORIGIN = "https://cloudix-app.azokia.com";

/**
 * Resolves the appropriate base origin for menu links.
 * On desktop (Electron, file:// protocol) or SSR, falls back to the production web domain
 * so external users can access the link over the web.
 */
export function resolveMenuBaseOrigin(win?: Window): string {
  if (typeof win === "undefined") {
    return DEFAULT_PRODUCTION_WEB_ORIGIN;
  }

  const isDesktop = Boolean((win as any).electronAPI) || win.location?.protocol === "file:";
  if (isDesktop) {
    return DEFAULT_PRODUCTION_WEB_ORIGIN;
  }

  const origin = win.location?.origin;
  if (!origin || origin === "null" || origin.startsWith("file:")) {
    return DEFAULT_PRODUCTION_WEB_ORIGIN;
  }

  return origin;
}

/**
 * Builds a public digital menu link URL for a given token.
 * Format: `${origin}/#/menu/c/${token}`
 */
export function buildMenuLinkUrl(token: string, explicitOrigin?: string): string {
  const origin = explicitOrigin ?? (typeof window !== "undefined" ? resolveMenuBaseOrigin(window) : DEFAULT_PRODUCTION_WEB_ORIGIN);
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/#/menu/c/${encodeURIComponent(token)}`;
}

/**
 * Builds the canonical public digital menu URL for a given slug.
 * Format: `${DEFAULT_PRODUCTION_WEB_ORIGIN}/#/menu/${encodeURIComponent(slug)}`
 */
export function buildPublicMenuUrl(slug: string): string {
  return `${DEFAULT_PRODUCTION_WEB_ORIGIN}/#/menu/${encodeURIComponent(slug)}`;
}

/**
 * Builds a table-specific public digital menu URL for a given slug and table number.
 * Format: `${buildPublicMenuUrl(slug)}?mesa=${mesa}`
 * Requires table number to be an integer >= 1. Returns empty string for invalid inputs.
 */
export function buildTableMenuUrl(slug: string, mesa: number): string {
  const cleanSlug = slug.trim();
  if (!cleanSlug || typeof mesa !== "number" || !Number.isInteger(mesa) || mesa < 1) {
    return "";
  }
  return `${buildPublicMenuUrl(cleanSlug)}?mesa=${mesa}`;
}
