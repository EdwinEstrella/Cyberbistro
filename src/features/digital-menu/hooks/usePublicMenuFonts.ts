import { useEffect } from "react";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700;800&display=swap";

/**
 * Injects Google Fonts (<link> for Space Grotesk and Inter) only when mounting
 * on public digital menu routes. Leaves desktop application fonts unaltered.
 */
export function usePublicMenuFonts(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const existing = document.querySelector(`link[href="${GOOGLE_FONTS_HREF}"]`);
    if (existing) return;

    if (!document.querySelector('link[href="https://fonts.googleapis.com"]')) {
      const preconnectGoogle = document.createElement("link");
      preconnectGoogle.rel = "preconnect";
      preconnectGoogle.href = "https://fonts.googleapis.com";
      document.head.appendChild(preconnectGoogle);
    }

    if (!document.querySelector('link[href="https://fonts.gstatic.com"]')) {
      const preconnectGstatic = document.createElement("link");
      preconnectGstatic.rel = "preconnect";
      preconnectGstatic.href = "https://fonts.gstatic.com";
      preconnectGstatic.crossOrigin = "anonymous";
      document.head.appendChild(preconnectGstatic);
    }

    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = GOOGLE_FONTS_HREF;
    fontLink.id = "cyberbistro-public-menu-fonts";
    document.head.appendChild(fontLink);
  }, []);
}
