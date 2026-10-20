/** Public host DGII calls for inbound e-CF services (Cloudflare tunnel -> Kong -> ecf-receptor function). */
export const ECF_RECEPTOR_BASE_URL = "https://cloudix-ecf.azokia.com";

const RNC_PLACEHOLDER = "EMISOR";

export interface ReceptorUrls {
  /** Base registered at DGII for this taxpayer: `{host}/{rnc}`. */
  base: string;
  authentication: string;
  reception: string;
  approval: string;
  /**
   * What goes in each DGII portal URL field: the portal shows `https://` before it and the service path after it,
   * so pasting a full URL there duplicates both.
   */
  portalField: string;
  /** Fixed service paths the DGII portal appends after `portalField`. */
  paths: { authentication: string; reception: string; approval: string };
}

const SERVICE_PATHS = {
  authentication: "/fe/autenticacion/api/[semilla|ValidacionCertificado]",
  reception: "/fe/recepcion/api/ecf",
  approval: "/fe/aprobacioncomercial/api/ecf",
} as const;

/** Digits of an RNC (dashes and spaces stripped); falls back to a visible placeholder when empty. */
export function receptorRncSegment(rnc: string | null | undefined): string {
  const digits = (rnc ?? "").replace(/\D/g, "");
  return digits || RNC_PLACEHOLDER;
}

export function buildReceptorUrls(rnc: string | null | undefined): ReceptorUrls {
  const base = `${ECF_RECEPTOR_BASE_URL}/${receptorRncSegment(rnc)}`;
  return {
    base,
    authentication: `${base}${SERVICE_PATHS.authentication}`,
    reception: `${base}${SERVICE_PATHS.reception}`,
    approval: `${base}${SERVICE_PATHS.approval}`,
    portalField: base.replace(/^https?:\/\//, ""),
    paths: { ...SERVICE_PATHS },
  };
}
