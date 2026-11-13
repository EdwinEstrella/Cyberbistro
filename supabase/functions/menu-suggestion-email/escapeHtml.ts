/**
 * Escapes characters with special meaning in HTML to prevent XSS / HTML injection.
 * Safe for use in text nodes and attribute values in generated HTML email templates.
 */
export function escapeHtml(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
