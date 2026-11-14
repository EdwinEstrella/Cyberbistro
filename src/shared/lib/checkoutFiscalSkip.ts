import type { FiscalMode } from "./fiscalTypes";

export interface ShouldRunCheckoutFiscalParams {
  skipFiscal: boolean;
  fiscalMode: FiscalMode;
  solicitaComprobante: boolean;
  canEmitDefaultConsumo: boolean;
  tenantId: string | null | undefined;
}

/**
 * Resolves the initial value of the per-sale "Sin comprobante" switch from the
 * business setting `sin_comprobante_por_defecto`. Missing or non-true values mean OFF,
 * so businesses that never configured it keep billing fiscal receipts.
 */
export function resolveInitialSkipFiscal(defaultSkip: boolean | null | undefined): boolean {
  return defaultSkip === true;
}

/**
 * Determines whether checkout should invoke the fiscal engine to emit an NCF or e-NCF.
 *
 * Returns false when skipFiscal is true, tenantId is missing, or fiscalMode is "internal_receipt".
 * Otherwise returns true if either solicitaComprobante or canEmitDefaultConsumo is enabled.
 */
export function shouldRunCheckoutFiscal(params: ShouldRunCheckoutFiscalParams): boolean {
  if (params.skipFiscal) {
    return false;
  }
  if (!params.tenantId) {
    return false;
  }
  if (params.fiscalMode === "internal_receipt") {
    return false;
  }
  return Boolean(params.solicitaComprobante || params.canEmitDefaultConsumo);
}
