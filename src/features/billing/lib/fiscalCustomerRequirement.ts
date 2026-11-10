import { ncfTypeRequiresClientRnc } from "../../../shared/lib/ncf";

export const FISCAL_CUSTOMER_REQUIRED_MESSAGE =
  "Falta el cliente: buscá por nombre o RNC y seleccioná uno con RNC y nombre para emitir este comprobante.";

export interface FiscalCustomerRequirementParams {
  fiscalActive: boolean;
  solicitaComprobante: boolean;
  ncfType: string | null | undefined;
  customer?: {
    name?: string | null;
    document_id?: string | null;
  } | null;
}

/**
 * Validates whether the fiscal checkout customer requirement is satisfied.
 * When fiscal billing is active, fiscal receipt is requested, and the selected
 * NCF type requires a client (e.g. B01, E31), a customer must be selected with
 * both a non-empty name and a non-empty document_id (RNC).
 *
 * Returns a user-facing Spanish warning message if the requirement is not met,
 * or null if valid / not required.
 */
export function getFiscalCustomerIssue(
  params: FiscalCustomerRequirementParams
): string | null {
  const { fiscalActive, solicitaComprobante, ncfType, customer } = params;

  if (!fiscalActive || !solicitaComprobante) {
    return null;
  }

  if (!ncfTypeRequiresClientRnc(ncfType)) {
    return null;
  }

  if (!customer) {
    return FISCAL_CUSTOMER_REQUIRED_MESSAGE;
  }

  const hasName = Boolean(customer.name && customer.name.trim().length > 0);
  const hasDocumentId = Boolean(
    customer.document_id && customer.document_id.trim().length > 0
  );

  if (!hasName || !hasDocumentId) {
    return FISCAL_CUSTOMER_REQUIRED_MESSAGE;
  }

  return null;
}

/**
 * Resolves the invoice customer name.
 * When a customer is selected and has a non-empty name, that registered name
 * takes precedence so the invoice matches the customer record/RNC.
 * Otherwise falls back to the typed name in the search box, or empty string.
 */
export function resolveInvoiceCustomerName(
  customer?: { name?: string | null } | null,
  typedName?: string | null
): string {
  const customerName = customer?.name?.trim();
  if (customerName) {
    return customerName;
  }
  return typedName?.trim() || "";
}

