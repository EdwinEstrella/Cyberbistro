export interface ParsedRosterRow {
  rawLine: string;
  lineNumber: number;
  fullName: string;
  documentId: string | null;
  isValid: boolean;
  error?: string;
}

export interface ParseRosterResult {
  rows: ParsedRosterRow[];
  validRows: ParsedRosterRow[];
  invalidRows: ParsedRosterRow[];
  totalCount: number;
}

/**
 * Normalizes cédula / document ID to digits only.
 */
export function normalizeCedula(doc?: string | null): string {
  if (!doc) return "";
  return doc.replace(/\D/g, "");
}

/**
 * Normalizes a full name for duplicate comparison (lower + unaccent + whitespace collapse).
 */
export function normalizeEmployeeName(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses lines of text in the format "Nombre, Cédula" (cédula optional).
 * Returns valid and invalid rows with descriptive error messages.
 */
export function parseRosterText(text: string): ParseRosterResult {
  if (!text || !text.trim()) {
    return { rows: [], validRows: [], invalidRows: [], totalCount: 0 };
  }

  const lines = text.split(/\r?\n/);
  const rows: ParsedRosterRow[] = [];
  const seenNames = new Set<string>();
  const seenCedulas = new Set<string>();

  let lineNumber = 0;
  for (const rawLine of lines) {
    lineNumber++;
    const trimmed = rawLine.trim();
    if (!trimmed) continue; // skip blank lines

    // Parse "Nombre, Cédula"
    let fullName = "";
    let rawCedula = "";

    const commaIndex = trimmed.indexOf(",");
    if (commaIndex >= 0) {
      fullName = trimmed.slice(0, commaIndex).trim();
      rawCedula = trimmed.slice(commaIndex + 1).trim();
    } else {
      fullName = trimmed;
    }

    // Name validations
    if (fullName.length < 2 || fullName.length > 80) {
      rows.push({
        rawLine,
        lineNumber,
        fullName,
        documentId: null,
        isValid: false,
        error: "El nombre debe tener entre 2 y 80 caracteres.",
      });
      continue;
    }

    // Cédula validations (optional, but 11 digits when provided)
    let documentId: string | null = null;
    if (rawCedula) {
      const digitsOnly = normalizeCedula(rawCedula);
      if (digitsOnly.length !== 11) {
        rows.push({
          rawLine,
          lineNumber,
          fullName,
          documentId: null,
          isValid: false,
          error: "La cédula debe contener exactamente 11 dígitos.",
        });
        continue;
      }
      documentId = digitsOnly;
    }

    // Duplicate check in batch
    const normalizedName = normalizeEmployeeName(fullName);
    if (seenNames.has(normalizedName)) {
      rows.push({
        rawLine,
        lineNumber,
        fullName,
        documentId,
        isValid: false,
        error: "Nombre duplicado en la lista.",
      });
      continue;
    }

    if (documentId && seenCedulas.has(documentId)) {
      rows.push({
        rawLine,
        lineNumber,
        fullName,
        documentId,
        isValid: false,
        error: "Cédula duplicada en la lista.",
      });
      continue;
    }

    seenNames.add(normalizedName);
    if (documentId) {
      seenCedulas.add(documentId);
    }

    rows.push({
      rawLine,
      lineNumber,
      fullName,
      documentId,
      isValid: true,
    });
  }

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  return {
    rows,
    validRows,
    invalidRows,
    totalCount: rows.length,
  };
}
