import { lookupBusinessByRnc, type BusinessRncLookup } from "../../../shared/lib/dgiiRncLookup";

export interface CompanyLookupResult {
  rnc: string;
  nombre_empresa: string;
}

export type CompanyLookupResponse =
  | { success: true; data: CompanyLookupResult; message: string }
  | { success: false; error: string };

export async function lookupCompanyByRnc(
  rawRnc: string,
  lookupFn: (rnc: string) => Promise<{ data: BusinessRncLookup | null; error: string | null }> = lookupBusinessByRnc
): Promise<CompanyLookupResponse> {
  const trimmed = rawRnc.trim();
  if (!trimmed) {
    return { success: false, error: "Ingresá un RNC válido." };
  }

  try {
    const result = await lookupFn(trimmed);
    if (result.error || !result.data) {
      return {
        success: false,
        error: result.error || "No encontramos la empresa en la DGII.",
      };
    }

    const nombre_empresa = (result.data.tradeName || result.data.legalName).trim();
    return {
      success: true,
      data: {
        rnc: result.data.rnc,
        nombre_empresa,
      },
      message: `Empresa encontrada: ${result.data.legalName}.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo consultar la empresa en la DGII.",
    };
  }
}
