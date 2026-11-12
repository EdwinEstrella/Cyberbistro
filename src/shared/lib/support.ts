export const SUPPORT_WHATSAPP_PHONE = "18095968986";

export const SUPPORT_WHATSAPP_BLOCKED_URL =
  "https://wa.me/18095968986?text=Hola%2C%20mi%20cuenta%20est%C3%A1%20bloqueada%20y%20necesito%20ayuda";

/**
 * Formats a raw phone string into a readable representation, e.g. "+1 (809) 596-8986".
 */
export function formatSupportPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `+1 (${area}) ${prefix}-${line}`;
  }
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `+1 (${area}) ${prefix}-${line}`;
  }
  return phone;
}
