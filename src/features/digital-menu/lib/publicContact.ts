import type { PublicContact } from "../../menu-links/lib/publicMenuCalendar";

export interface PublicContactValidationResult {
  value: PublicContact;
  errors: Partial<Record<keyof PublicContact, string>>;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const WHATSAPP_CLEAN_REGEX = /[\s\-().]/g;
const DIGITS_ONLY_REGEX = /^\d{8,15}$/;

const INSTAGRAM_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
const FACEBOOK_HANDLE_REGEX = /^[a-zA-Z0-9.]{1,50}$/;
const TIKTOK_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,30}$/;

function isValidHttpsUrl(input: string): URL | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol === "https:" && parsed.hostname) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeSocialField(
  rawVal: string,
  handleRegex: RegExp,
  allowedDomains: string[],
  errorMessage: string
): { value?: string; error?: string } {
  // If it contains a protocol or slash, try parsing as https URL
  if (rawVal.includes("://") || rawVal.includes("/")) {
    const url = isValidHttpsUrl(rawVal);
    if (url && allowedDomains.some((d) => matchesDomain(url.hostname, d))) {
      return { value: rawVal };
    }
    return { error: errorMessage };
  }

  // Handle format: strip optional leading '@'
  const handle = rawVal.startsWith("@") ? rawVal.slice(1) : rawVal;
  if (handleRegex.test(handle)) {
    return { value: handle };
  }

  return { error: errorMessage };
}

/**
 * Trims, drops empty values, and validates all public contact fields.
 */
export function normalizePublicContact(input: unknown): PublicContactValidationResult {
  const value: PublicContact = {};
  const errors: Partial<Record<keyof PublicContact, string>> = {};

  if (!input || typeof input !== "object") {
    return { value, errors };
  }

  const raw = input as Record<string, unknown>;

  const getCleanString = (key: keyof PublicContact): string | null => {
    const rawVal = raw[key];
    if (typeof rawVal !== "string") return null;
    const trimmed = rawVal.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  // 1. wifi_name (max 64)
  const wifiName = getCleanString("wifi_name");
  if (wifiName !== null) {
    if (wifiName.length > 64) {
      errors.wifi_name = "El nombre del WiFi no puede tener más de 64 caracteres.";
    } else {
      value.wifi_name = wifiName;
    }
  }

  // 2. wifi_password (max 128)
  const wifiPassword = getCleanString("wifi_password");
  if (wifiPassword !== null) {
    if (wifiPassword.length > 128) {
      errors.wifi_password = "La clave del WiFi no puede tener más de 128 caracteres.";
    } else {
      value.wifi_password = wifiPassword;
    }
  }

  // 3. whatsapp (8-15 digits after stripping formatting)
  const whatsapp = getCleanString("whatsapp");
  if (whatsapp !== null) {
    const cleaned = whatsapp.replace(WHATSAPP_CLEAN_REGEX, "").replace(/^\+/, "");
    if (!DIGITS_ONLY_REGEX.test(cleaned)) {
      errors.whatsapp = "Ingresá un número de WhatsApp válido con código de país (entre 8 y 15 dígitos).";
    } else {
      value.whatsapp = cleaned;
    }
  }

  // 4. instagram (handle without @ or https url on instagram.com / instagr.am)
  const instagram = getCleanString("instagram");
  if (instagram !== null) {
    const res = normalizeSocialField(
      instagram,
      INSTAGRAM_HANDLE_REGEX,
      ["instagram.com", "instagr.am"],
      "Ingresá un usuario o enlace válido de Instagram."
    );
    if (res.error) {
      errors.instagram = res.error;
    } else if (res.value) {
      value.instagram = res.value;
    }
  }

  // 5. facebook (handle without @ or https url on facebook.com / fb.com)
  const facebook = getCleanString("facebook");
  if (facebook !== null) {
    const res = normalizeSocialField(
      facebook,
      FACEBOOK_HANDLE_REGEX,
      ["facebook.com", "fb.com"],
      "Ingresá un usuario o enlace válido de Facebook."
    );
    if (res.error) {
      errors.facebook = res.error;
    } else if (res.value) {
      value.facebook = res.value;
    }
  }

  // 6. tiktok (handle without @ or https url on tiktok.com)
  const tiktok = getCleanString("tiktok");
  if (tiktok !== null) {
    const res = normalizeSocialField(
      tiktok,
      TIKTOK_HANDLE_REGEX,
      ["tiktok.com"],
      "Ingresá un usuario o enlace válido de TikTok."
    );
    if (res.error) {
      errors.tiktok = res.error;
    } else if (res.value) {
      value.tiktok = res.value;
    }
  }

  // 7. google_review_url (https:// only)
  const googleReviewUrl = getCleanString("google_review_url");
  if (googleReviewUrl !== null) {
    const parsed = isValidHttpsUrl(googleReviewUrl);
    if (!parsed) {
      errors.google_review_url = "Ingresá un enlace válido que comience con https:// para la reseña de Google.";
    } else {
      value.google_review_url = googleReviewUrl;
    }
  }

  // 8. maps_url (https:// only)
  const mapsUrl = getCleanString("maps_url");
  if (mapsUrl !== null) {
    const parsed = isValidHttpsUrl(mapsUrl);
    if (!parsed) {
      errors.maps_url = "Ingresá un enlace válido que comience con https:// para Google Maps.";
    } else {
      value.maps_url = mapsUrl;
    }
  }

  // 9. suggestion_email (valid email, max 254)
  const suggestionEmail = getCleanString("suggestion_email");
  if (suggestionEmail !== null) {
    if (suggestionEmail.length > 254 || !EMAIL_REGEX.test(suggestionEmail)) {
      errors.suggestion_email = "Ingresá un correo electrónico válido para recibir sugerencias.";
    } else {
      value.suggestion_email = suggestionEmail;
    }
  }

  return { value, errors };
}
