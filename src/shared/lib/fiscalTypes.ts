export const FISCAL_MODES = ["internal_receipt", "ncf_legacy", "dgii_ecf"] as const;

export type FiscalMode = (typeof FISCAL_MODES)[number];

export const ECF_FISCAL_STATUSES = [
  "pending_offline",
  "pending_sync",
  "queued",
  "signed",
  "submitted",
  "accepted",
  "rejected",
  "retryable_error",
  "terminal_error",
  "pending_configuration",
] as const;

export type EcfFiscalStatus = (typeof ECF_FISCAL_STATUSES)[number];

export interface EcfDocumentSnapshot {
  id: string;
  tenantId: string;
  facturaId: string;
  status: EcfFiscalStatus;
  certificateMetadataId: string | null;
  dgiiTrackId: string | null;
  rfce_threshold_used: number | null;
  rejection_scope: "individual" | "batch" | null;
  batchId?: string | null;
}

export function isFiscalMode(value: unknown): value is FiscalMode {
  return typeof value === "string" && (FISCAL_MODES as readonly string[]).includes(value);
}

export function normalizeFiscalMode(
  explicitMode: unknown,
  legacyNcfFiscalActive: boolean | null | undefined
): FiscalMode {
  if (isFiscalMode(explicitMode)) return explicitMode;
  return legacyNcfFiscalActive === true ? "ncf_legacy" : "internal_receipt";
}

export function isEcfFiscalStatus(value: unknown): value is EcfFiscalStatus {
  return typeof value === "string" && (ECF_FISCAL_STATUSES as readonly string[]).includes(value);
}
