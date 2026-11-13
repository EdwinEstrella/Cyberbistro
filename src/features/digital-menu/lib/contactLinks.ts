import type { PublicContact } from "../../menu-links/lib/publicMenuCalendar";

export type UtilityActionId =
  | "games"
  | "wifi"
  | "whatsapp"
  | "social"
  | "google_review"
  | "maps";

export interface UtilityAction {
  id: UtilityActionId;
  label: string;
  type: "sheet" | "link";
  sheet?: "games" | "wifi" | "whatsapp" | "social";
  url?: string;
}

const DIGITS_ONLY_REGEX = /^\d{8,15}$/;
const INSTAGRAM_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
const FACEBOOK_HANDLE_REGEX = /^[a-zA-Z0-9.]{1,50}$/;
const TIKTOK_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;

/**
 * Validates and normalizes an HTTPS URL. Drops any non-https protocols (http, javascript, data, etc.).
 */
export function sanitizeHttpsUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" && parsed.hostname) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a phone number for WhatsApp and generates the wa.me link.
 * Requires 8 to 15 digits.
 */
export function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (!DIGITS_ONLY_REGEX.test(digits)) return null;
  return `https://wa.me/${digits}`;
}

/**
 * Escapes reserved characters in text fields for vCard 3.0 (RFC 2426).
 * Escapes backslashes, semicolons, commas, and newlines.
 */
function escapeVCardText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Builds a vCard 3.0 string for saving the restaurant contact.
 */
export function buildWhatsAppVCard(name: string, phone: string): string {
  const cleanName = escapeVCardText((name || "").trim() || "Restaurante");
  const cleanPhone = (phone || "").trim();
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${cleanName}`,
    `TEL;TYPE=CELL:${cleanPhone}`,
    "END:VCARD",
  ].join("\r\n");
}

function matchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Builds an HTTPS URL for a social platform handle or full URL.
 * Drops invalid or insecure links.
 */
export function buildSocialUrl(
  kind: "instagram" | "facebook" | "tiktok",
  stored: string | null | undefined
): string | null {
  if (!stored || typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;

  // If already a full URL or contains protocol/slash
  if (trimmed.includes("://") || trimmed.includes("/")) {
    const validHttps = sanitizeHttpsUrl(trimmed);
    if (!validHttps) return null;

    try {
      const parsed = new URL(validHttps);
      if (kind === "instagram" && ["instagram.com", "instagr.am"].some((d) => matchesDomain(parsed.hostname, d))) {
        return validHttps;
      }
      if (kind === "facebook" && ["facebook.com", "fb.com"].some((d) => matchesDomain(parsed.hostname, d))) {
        return validHttps;
      }
      if (kind === "tiktok" && matchesDomain(parsed.hostname, "tiktok.com")) {
        return validHttps;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Handle format: strip leading '@'
  const handle = trimmed.replace(/^@+/, "");

  if (kind === "instagram" && INSTAGRAM_HANDLE_REGEX.test(handle)) {
    return `https://instagram.com/${handle}`;
  }
  if (kind === "facebook" && FACEBOOK_HANDLE_REGEX.test(handle)) {
    return `https://facebook.com/${handle}`;
  }
  if (kind === "tiktok" && TIKTOK_HANDLE_REGEX.test(handle)) {
    return `https://tiktok.com/@${handle}`;
  }

  return null;
}

/**
 * Returns the ordered list of available utility actions for the given mode and contact config.
 * Buttons are rendered only when their underlying data is present.
 */
export function getUtilityActions(
  contact: PublicContact | null | undefined,
  mode: "table" | "takeout"
): UtilityAction[] {
  const actions: UtilityAction[] = [];

  // 1. Games (Table mode only)
  if (mode === "table") {
    actions.push({
      id: "games",
      label: "Juegos",
      type: "sheet",
      sheet: "games",
    });
  }

  // 2. WiFi (Table mode only, when wifi_name is provided)
  if (mode === "table" && contact?.wifi_name && contact.wifi_name.trim().length > 0) {
    actions.push({
      id: "wifi",
      label: "WiFi",
      type: "sheet",
      sheet: "wifi",
    });
  }

  // 2. WhatsApp
  if (contact?.whatsapp && buildWhatsAppUrl(contact.whatsapp) !== null) {
    actions.push({
      id: "whatsapp",
      label: "WhatsApp",
      type: "sheet",
      sheet: "whatsapp",
    });
  }

  // 3. Social networks (when at least one network is valid)
  const hasSocial = Boolean(
    buildSocialUrl("instagram", contact?.instagram) ||
    buildSocialUrl("facebook", contact?.facebook) ||
    buildSocialUrl("tiktok", contact?.tiktok)
  );
  if (hasSocial) {
    actions.push({
      id: "social",
      label: "Redes sociales",
      type: "sheet",
      sheet: "social",
    });
  }

  // 4. Google Review
  const googleReview = sanitizeHttpsUrl(contact?.google_review_url);
  if (googleReview) {
    actions.push({
      id: "google_review",
      label: "Calificanos en Google",
      type: "link",
      url: googleReview,
    });
  }

  // 5. How to get there (Maps)
  const mapsUrl = sanitizeHttpsUrl(contact?.maps_url);
  if (mapsUrl) {
    actions.push({
      id: "maps",
      label: "Cómo llegar",
      type: "link",
      url: mapsUrl,
    });
  }

  return actions;
}
