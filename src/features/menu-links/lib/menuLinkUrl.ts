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
