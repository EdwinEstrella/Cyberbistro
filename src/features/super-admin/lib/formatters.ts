/**
 * Formats a Dominican RNC (9 digits) or Cédula (11 digits).
 * Returns "Sin RNC" when missing or empty.
 */
export function formatRnc(rnc?: string | null): string {
  if (!rnc) return "Sin RNC";
  const trimmed = rnc.trim();
  if (!trimmed) return "Sin RNC";

  const digits = trimmed.replace(/\D/g, "");

  // If already properly formatted with dashes (e.g. 1-31-23456-7 or 101-00123-4 or 001-1234567-8)
  if (/^\d{1,3}-\d{2,5}-\d{5,7}-\d$/.test(trimmed) || /^\d{3}-\d{5}-\d$/.test(trimmed) || /^\d{3}-\d{7}-\d$/.test(trimmed)) {
    return trimmed;
  }

  // Dominican 9-digit business RNC
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 8)}-${digits.slice(8)}`;
  }

  // Dominican 11-digit personal cédula
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
  }

  return trimmed || "Sin RNC";
}

/**
 * Returns a 2-character uppercase monogram from a tenant or restaurant name.
 * e.g. "Salpimentao Restaurant" -> "SR", "El Rinconcito" -> "ER", "Café" -> "CA"
 */
export function getTenantInitials(name?: string | null): string {
  if (!name) return "RE";
  const words = name
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "RE";
  if (words.length === 1) {
    const single = words[0];
    return (single.slice(0, 2) || "RE").toUpperCase();
  }

  const first = words[0][0] || "";
  const second = words[1][0] || "";
  return `${first}${second}`.toUpperCase();
}

/**
 * Formats a date string into Spanish locale.
 */
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-DO", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}
