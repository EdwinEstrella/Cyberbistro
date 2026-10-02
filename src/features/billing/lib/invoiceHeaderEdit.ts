import { etiquetaTipoNcf, isNcfTypeCode, ncfTypeRequiresClientRnc } from "../../../shared/lib/ncf";

/** Header fields of an invoice that may be corrected after issuing it. */
export interface InvoiceHeaderFields {
  ncf: string | null;
  ncf_tipo: string | null;
  cliente_nombre: string | null;
  cliente_rnc: string | null;
  notas: string | null;
}

export interface InvoiceHeaderOriginal {
  ncf?: string | null;
  ncf_tipo?: string | null;
  cliente_nombre?: string | null;
  cliente_rnc?: string | null;
  notas?: string | null;
  fiscal_mode?: string | null;
}

/** Raw form values; `ncf_tipo` is never typed by the user, it is derived from the NCF. */
export interface InvoiceHeaderInput {
  ncf: string;
  cliente_nombre: string;
  cliente_rnc: string;
  notas: string;
}

export type InvoiceHeaderField = "ncf" | "cliente_rnc";

export type InvoiceHeaderEditResult =
  | { ok: true; changed: boolean; changes: Partial<InvoiceHeaderFields> }
  | { ok: false; errors: Partial<Record<InvoiceHeaderField, string>> };

const NCF_PATTERN = /^[BE]\d{10}$/;

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** e-CF invoices carry a DGII-assigned NCF: it must not be edited. */
export function isNcfLocked(invoice: Pick<InvoiceHeaderOriginal, "fiscal_mode">): boolean {
  return invoice.fiscal_mode === "dgii_ecf";
}

/**
 * Validates the edited header and returns only the fields that changed.
 * Pure: no I/O. NCF uniqueness is checked by the persistence layer.
 */
export function validateInvoiceHeaderEdit(
  original: InvoiceHeaderOriginal,
  input: InvoiceHeaderInput
): InvoiceHeaderEditResult {
  const errors: Partial<Record<InvoiceHeaderField, string>> = {};
  const locked = isNcfLocked(original);

  const originalNcf = clean(original.ncf);
  const originalTipo = clean(original.ncf_tipo);
  const originalNombre = clean(original.cliente_nombre);
  const originalRnc = clean(original.cliente_rnc);
  const originalNotas = clean(original.notas);

  const typedNcf = clean(input.ncf)?.toUpperCase() ?? null;
  let nextNcf: string | null = originalNcf;
  let nextTipo: string | null = originalTipo;

  if (locked) {
    if (typedNcf !== (originalNcf?.toUpperCase() ?? null)) {
      errors.ncf = "El NCF de un comprobante electrónico (e-CF) no se puede editar.";
    }
  } else if (typedNcf === null) {
    nextNcf = null;
    nextTipo = null;
  } else if (typedNcf !== originalNcf) {
    const prefix = typedNcf.slice(0, 3);
    if (!NCF_PATTERN.test(typedNcf) || !isNcfTypeCode(prefix)) {
      errors.ncf = "NCF inválido. Use un tipo válido (B/E + 2 dígitos) seguido de 8 dígitos, por ejemplo B0200000001.";
    } else {
      nextNcf = typedNcf;
      nextTipo = etiquetaTipoNcf(prefix);
    }
  }

  const nextNombre = clean(input.cliente_nombre);
  const nextRnc = clean(input.cliente_rnc);
  const nextNotas = clean(input.notas);

  const ncfChanged = nextNcf !== originalNcf;
  const rncChanged = nextRnc !== originalRnc;

  if (!errors.ncf && nextNcf && (ncfChanged || rncChanged) && ncfTypeRequiresClientRnc(nextNcf.slice(0, 3)) && !nextRnc) {
    errors.cliente_rnc = "Este tipo de comprobante requiere el RNC o cédula del cliente.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const changes: Partial<InvoiceHeaderFields> = {};
  if (nextNcf !== originalNcf) changes.ncf = nextNcf;
  if (nextTipo !== originalTipo) changes.ncf_tipo = nextTipo;
  if (nextNombre !== originalNombre) changes.cliente_nombre = nextNombre;
  if (nextRnc !== originalRnc) changes.cliente_rnc = nextRnc;
  if (nextNotas !== originalNotas) changes.notas = nextNotas;

  return { ok: true, changed: Object.keys(changes).length > 0, changes };
}
