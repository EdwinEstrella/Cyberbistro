import { insforgeClient } from "./insforge";

export type BusinessRncLookup = {
  rnc: string;
  legalName: string;
  tradeName: string;
  status: string;
};

type LookupResult =
  | { data: BusinessRncLookup; error: null }
  | { data: null; error: string };

function normalizeRnc(value: string): string {
  return value.replace(/\D/g, "");
}

export async function lookupBusinessByRnc(rawRnc: string): Promise<LookupResult> {
  const rnc = normalizeRnc(rawRnc);
  if (rnc.length !== 9) {
    return { data: null, error: "Ingresá un RNC válido de 9 dígitos." };
  }

  const desktopLookup = typeof window !== "undefined"
    ? window.electronAPI?.lookupBusinessRnc
    : undefined;
  if (desktopLookup) {
    const result = await desktopLookup(rnc);
    return result.error || !result.data
      ? { data: null, error: result.error || "No encontramos un negocio con ese RNC." }
      : { data: result.data, error: null };
  }

  const { data, error } = await insforgeClient.functions.invoke("lookup-business-rnc", {
    body: { rnc },
  });

  if (error) {
    return { data: null, error: error.message || "No pudimos consultar la DGII." };
  }

  const result = data as Partial<BusinessRncLookup> & { message?: string };
  if (!result?.legalName || !result.rnc) {
    return { data: null, error: result?.message || "No encontramos un negocio con ese RNC." };
  }

  return {
    data: {
      rnc: result.rnc,
      legalName: result.legalName,
      tradeName: result.tradeName ?? "",
      status: result.status ?? "",
    },
    error: null,
  };
}
