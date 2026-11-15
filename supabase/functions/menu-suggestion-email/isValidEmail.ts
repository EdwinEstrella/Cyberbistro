const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates whether an input looks like a valid email address.
 * Disallows whitespace, newline/control characters (header injection defense),
 * empty strings, non-string types, and strings exceeding RFC 5321 length (254 chars).
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== "string") {
    return false;
  }

  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }

  // Reject internal whitespace or control characters (e.g. CRLF injection)
  if (/[\r\n\t\s]/.test(trimmed)) {
    return false;
  }

  return EMAIL_REGEX.test(trimmed);
}
