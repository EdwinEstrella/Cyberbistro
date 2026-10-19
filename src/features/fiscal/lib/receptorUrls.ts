/** Public host DGII calls for inbound e-CF services (Cloudflare tunnel -> Kong -> ecf-receptor function). */
export const ECF_RECEPTOR_BASE_URL = "https://cloudix-ecf.azokia.com";

const RNC_PLACEHOLDER = "EMISOR";

export interface ReceptorUrls {
  /** Base registered at DGII for this taxpayer: `{host}/{rnc}`. */
  base: string;
  authentication: string;
  reception: string;
  approval: string;
}

/** Digits of an RNC (dashes and spaces stripped); falls back to a visible placeholder when empty. */
export function receptorRncSegment(rnc: string | null | undefined): string {
  const digits = (rnc ?? "").replace(/\D/g, "");
  return digits || RNC_PLACEHOLDER;
}

export function buildReceptorUrls(rnc: string | null | undefined): ReceptorUrls {
  const base = `${ECF_RECEPTOR_BASE_URL}/${receptorRncSegment(rnc)}`;
  return {
    base,
    authentication: `${base}/fe/autenticacion/api/[semilla|ValidacionCertificado]`,
    reception: `${base}/fe/recepcion/api/ecf`,
    approval: `${base}/fe/aprobacioncomercial/api/ecf`,
  };
}
