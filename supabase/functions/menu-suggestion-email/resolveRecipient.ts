import { isValidEmail } from "./isValidEmail.ts";

export interface ResolveRecipientOptions {
  settingsEmail?: string | null;
  ownerEmail?: string | null;
}

/**
 * Resolves the destination email address for a menu suggestion.
 * Hierarchy:
 * 1. digital_menu_settings.public_contact->>'suggestion_email' (if valid email)
 * 2. Tenant owner account email (if valid email)
 * 3. null (no resolvable recipient -> skip delivery)
 */
export function resolveRecipient(options: ResolveRecipientOptions): string | null {
  const settingsEmail = typeof options.settingsEmail === "string" ? options.settingsEmail.trim() : "";
  if (settingsEmail && isValidEmail(settingsEmail)) {
    return settingsEmail;
  }

  const ownerEmail = typeof options.ownerEmail === "string" ? options.ownerEmail.trim() : "";
  if (ownerEmail && isValidEmail(ownerEmail)) {
    return ownerEmail;
  }

  return null;
}
