/**
 * Printed representation ("Representación Impresa") of the DGII certification simulation e-CF:
 * signed XML -> printable model, the DGII QR URL, and the 11 portal slots of step 5.
 * Pure: no network, no DOM rendering. XML parsing uses a DOMParser (the renderer's, or one injected
 * by tests).
 */
import type { SubmissionItem, TestSetEnvironment } from "./ecfCertificationRun";

export interface PrintedItem {
  numeroLinea?: string;
  nombreItem: string;
  indicadorFacturacion?: string;
  cantidadItem?: string;
  unidadMedida?: string;
  precioUnitarioItem?: string;
  descuentoMonto?: string;
  montoItem?: string;
  montoItbisRetenido?: string;
  montoIsrRetenido?: string;
}

/** Totales fields printed on the document, keyed by their XML element names. */
export const TOTAL_FIELDS = [
  "MontoGravadoTotal",
  "MontoGravadoI1",
  "MontoGravadoI2",
  "MontoGravadoI3",
  "MontoExento",
  "ITBIS1",
  "ITBIS2",
  "ITBIS3",
  "TotalITBIS",
  "TotalITBIS1",
  "TotalITBIS2",
  "TotalITBIS3",
  "MontoImpuestoAdicional",
  "MontoTotal",
  "MontoNoFacturable",
  "TotalITBISRetenido",
  "TotalISRRetencion",
  "ValorPagar",
] as const;
export type TotalField = (typeof TOTAL_FIELDS)[number];
export type PrintedTotals = Partial<Record<TotalField, string>> & { MontoTotal: string };

export interface PrintedEcf {
  tipoEcf: string;
  encf: string;
  fechaVencimientoSecuencia?: string;
  indicadorMontoGravado?: string;
  tipoIngresos?: string;
  tipoPago?: string;
  fechaLimitePago?: string;
  emisor: {
    rnc: string;
    razonSocial?: string;
    nombreComercial?: string;
    direccion?: string;
    municipio?: string;
    provincia?: string;
    telefonos: string[];
    correo?: string;
    fechaEmision?: string;
  };
  comprador?: {
    rnc?: string;
    identificadorExtranjero?: string;
    razonSocial?: string;
    direccion?: string;
  };
  referencia?: {
    ncfModificado?: string;
    fechaNcfModificado?: string;
    codigoModificacion?: string;
    razonModificacion?: string;
  };
  items: PrintedItem[];
  totales: PrintedTotals;
  otraMoneda?: {
    tipoMoneda?: string;
    tipoCambio?: string;
    montoTotalOtraMoneda?: string;
  };
  fechaHoraFirma?: string;
  signatureValue: string;
}

interface XmlParser {
  parseFromString(xml: string, type: "text/xml"): Document;
}

const ELEMENT_NODE = 1;

function elementChildren(node: Node | null | undefined): Element[] {
  if (!node) return [];
  const out: Element[] = [];
  const nodes = node.childNodes;
  for (let i = 0; i < nodes.length; i++) if (nodes[i].nodeType === ELEMENT_NODE) out.push(nodes[i] as Element);
  return out;
}

const nameOf = (el: Element) => el.localName || el.nodeName.replace(/^.*:/, "");

/** First element reached by following child local names. */
function find(root: Element | null | undefined, path: string): Element | null {
  let current: Element | null = root ?? null;
  for (const name of path.split("/")) {
    if (!current) return null;
    current = elementChildren(current).find((el) => nameOf(el) === name) ?? null;
  }
  return current;
}

function findAll(root: Element | null | undefined, name: string): Element[] {
  return elementChildren(root).filter((el) => nameOf(el) === name);
}

function text(root: Element | null | undefined, path: string): string | undefined {
  const value = find(root, path)?.textContent?.trim();
  return value ? value : undefined;
}

function findDescendant(root: Element, name: string): Element | null {
  for (const el of elementChildren(root)) {
    if (nameOf(el) === name) return el;
    const nested = findDescendant(el, name);
    if (nested) return nested;
  }
  return null;
}

function defaultParser(): XmlParser {
  const Parser = (globalThis as { DOMParser?: new () => XmlParser }).DOMParser;
  if (!Parser) throw new Error("No XML parser is available in this environment.");
  return new Parser();
}

function compact<T extends object>(value: T): T | undefined {
  return Object.values(value).some((entry) => entry !== undefined) ? value : undefined;
}

/** Parses a signed DGII e-CF into the fields its printed representation shows. */
export function parseSignedEcf(xml: string, parser: XmlParser = defaultParser()): PrintedEcf {
  let doc: Document;
  try {
    doc = parser.parseFromString(xml, "text/xml");
  } catch {
    throw new Error("The signed e-CF is not valid XML.");
  }
  const root = doc?.documentElement;
  if (!root || nameOf(root) !== "ECF" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The signed document is not an e-CF (ECF root expected).");
  }
  const header = find(root, "Encabezado");
  const idDoc = find(header, "IdDoc");
  const emisor = find(header, "Emisor");
  const comprador = find(header, "Comprador");
  const totalesEl = find(header, "Totales");

  const encf = text(idDoc, "eNCF");
  const rncEmisor = text(emisor, "RNCEmisor");
  const montoTotal = text(totalesEl, "MontoTotal");
  const signatureValue = findDescendant(root, "SignatureValue")?.textContent?.replace(/\s+/g, "") || undefined;
  const missing = [
    !encf && "eNCF",
    !rncEmisor && "RNCEmisor",
    !montoTotal && "MontoTotal",
    !signatureValue && "SignatureValue",
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`The signed e-CF is missing ${missing.join(", ")}.`);

  const totales = { MontoTotal: montoTotal! } as PrintedTotals;
  for (const field of TOTAL_FIELDS) {
    const value = text(totalesEl, field);
    if (value !== undefined) totales[field] = value;
  }

  const items: PrintedItem[] = findAll(find(root, "DetallesItems"), "Item").map((item) => ({
    numeroLinea: text(item, "NumeroLinea"),
    nombreItem: text(item, "NombreItem") ?? "",
    indicadorFacturacion: text(item, "IndicadorFacturacion"),
    cantidadItem: text(item, "CantidadItem"),
    unidadMedida: text(item, "UnidadMedida"),
    precioUnitarioItem: text(item, "PrecioUnitarioItem"),
    descuentoMonto: text(item, "DescuentoMonto"),
    montoItem: text(item, "MontoItem"),
    montoItbisRetenido: text(item, "Retencion/MontoITBISRetenido"),
    montoIsrRetenido: text(item, "Retencion/MontoISRRetenido"),
  }));

  const referencia = find(root, "InformacionReferencia");
  const otraMoneda = find(header, "OtraMoneda");

  return {
    tipoEcf: text(idDoc, "TipoeCF") ?? encf!.slice(1, 3),
    encf: encf!,
    fechaVencimientoSecuencia: text(idDoc, "FechaVencimientoSecuencia"),
    indicadorMontoGravado: text(idDoc, "IndicadorMontoGravado"),
    tipoIngresos: text(idDoc, "TipoIngresos"),
    tipoPago: text(idDoc, "TipoPago"),
    fechaLimitePago: text(idDoc, "FechaLimitePago"),
    emisor: {
      rnc: rncEmisor!,
      razonSocial: text(emisor, "RazonSocialEmisor"),
      nombreComercial: text(emisor, "NombreComercial"),
      direccion: text(emisor, "DireccionEmisor"),
      municipio: text(emisor, "Municipio"),
      provincia: text(emisor, "Provincia"),
      telefonos: findAll(find(emisor, "TablaTelefonoEmisor"), "TelefonoEmisor")
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean),
      correo: text(emisor, "CorreoEmisor"),
      fechaEmision: text(emisor, "FechaEmision"),
    },
    comprador: comprador
      ? compact({
          rnc: text(comprador, "RNCComprador"),
          identificadorExtranjero: text(comprador, "IdentificadorExtranjero"),
          razonSocial: text(comprador, "RazonSocialComprador"),
          direccion: text(comprador, "DireccionComprador"),
        })
      : undefined,
    referencia: referencia
      ? compact({
          ncfModificado: text(referencia, "NCFModificado"),
          fechaNcfModificado: text(referencia, "FechaNCFModificado"),
          codigoModificacion: text(referencia, "CodigoModificacion"),
          razonModificacion: text(referencia, "RazonModificacion"),
        })
      : undefined,
    items,
    totales,
    otraMoneda: otraMoneda
      ? compact({
          tipoMoneda: text(otraMoneda, "TipoMoneda"),
          tipoCambio: text(otraMoneda, "TipoCambio"),
          montoTotalOtraMoneda: text(otraMoneda, "MontoTotalOtraMoneda"),
        })
      : undefined,
    fechaHoraFirma: text(root, "FechaHoraFirma"),
    signatureValue: signatureValue!,
  };
}

/** CodigoSeguridadeCF: the first six characters of the SignatureValue (whitespace removed). */
export function securityCodeFromSignature(signatureValue: string): string {
  const value = signatureValue.replace(/\s+/g, "");
  if (value.length < 6) throw new Error("The SignatureValue is too short to derive the security code.");
  return value.slice(0, 6);
}

/** Prefers the code stored by the server; derives it from the signature otherwise. */
export function resolveSecurityCode(model: PrintedEcf, stored?: string | null): string {
  const trimmed = stored?.trim();
  return trimmed ? trimmed : securityCodeFromSignature(model.signatureValue);
}

export type DgiiEnvironmentSegment = "testecf" | "certecf" | "ecf";

export function dgiiEnvironmentSegment(environment: TestSetEnvironment | "production"): DgiiEnvironmentSegment {
  if (environment === "production") return "ecf";
  return environment === "certification" ? "certecf" : "testecf";
}

export const CONSUMO_THRESHOLD = 250000;

/** A consumo e-CF (E32) under 250 mil uses the FC QR variant. */
export function isConsumoUnder250k(model: PrintedEcf): boolean {
  const total = Number(model.totales.MontoTotal);
  return model.tipoEcf === "32" && Number.isFinite(total) && total < CONSUMO_THRESHOLD;
}

const enc = encodeURIComponent;

/** DGII QR URL of the printed representation; dates and amount are taken verbatim from the XML. */
export function buildPrintedQrUrl(
  model: PrintedEcf,
  options: { environment: DgiiEnvironmentSegment; securityCode: string; isConsumoUnder250k?: boolean },
): string {
  const env = options.environment.toLowerCase();
  const consumo = options.isConsumoUnder250k ?? isConsumoUnder250k(model);
  const common = { rnc: enc(model.emisor.rnc), encf: enc(model.encf), monto: enc(model.totales.MontoTotal), code: enc(options.securityCode) };
  if (consumo) {
    return `https://fc.dgii.gov.do/${env}/consultatimbrefc?rncemisor=${common.rnc}&encf=${common.encf}&montototal=${common.monto}&codigoseguridad=${common.code}`;
  }
  if (!model.emisor.fechaEmision) throw new Error("The e-CF has no FechaEmision for the QR code.");
  if (!model.fechaHoraFirma) throw new Error("The e-CF has no FechaHoraFirma for the QR code.");
  const buyer = model.comprador?.rnc;
  const buyerParam = buyer && !/^E4[37]/i.test(model.encf) ? `RncComprador=${enc(buyer)}&` : "";
  return (
    `https://ecf.dgii.gov.do/${env}/consultatimbre?rncemisor=${common.rnc}&${buyerParam}encf=${common.encf}` +
    `&fechaemision=${enc(model.emisor.fechaEmision)}&montototal=${common.monto}&fechafirma=${enc(model.fechaHoraFirma)}` +
    `&codigoseguridad=${common.code}`
  );
}

/** One file input of the DGII portal step 5 page. */
export interface PrintedSlot {
  /** Portal input name, exactly as the portal shows it. */
  inputName: string;
  label: string;
  tipoEcf: string;
  /** E32 slots split: reception e-CF (>= 250 mil) vs consumo uploaded to the portal (< 250 mil). */
  variant: "standard" | "consumo_gte_250k" | "consumo_lt_250k";
}

const standardSlot = (tipo: string): PrintedSlot => ({ inputName: `ECF_${tipo}`, label: `Comprobante tipo ${tipo}`, tipoEcf: tipo, variant: "standard" });

/** The 11 portal slots, in portal order. */
export const PRINTED_SLOTS: PrintedSlot[] = [
  standardSlot("31"),
  { inputName: "ECF_32 Mayor_o_Igual_250mil", label: "Comprobante tipo 32 (mayor o igual a 250 mil)", tipoEcf: "32", variant: "consumo_gte_250k" },
  ...["33", "34", "41", "43", "44", "45", "46", "47"].map(standardSlot),
  { inputName: "ECF_32 Menor_250mil", label: "Comprobante tipo 32 (menor a 250 mil)", tipoEcf: "32", variant: "consumo_lt_250k" },
];

export interface SlotPick {
  slot: PrintedSlot;
  /** null when the run has no eligible document for the slot. */
  item: SubmissionItem | null;
}

const isAccepted = (item: SubmissionItem) => item.status === "accepted" || item.status === "accepted_conditional";

/** True when the submission can be printed for the slot (accepted by DGII and signed). */
function eligibleFor(slot: PrintedSlot, item: SubmissionItem, items: SubmissionItem[]): boolean {
  if (!item.signed || item.tipoEcf !== slot.tipoEcf) return false;
  if (slot.variant === "consumo_lt_250k") {
    // A consumo e-CF is never sent to reception: DGII accepts it through its RFCE summary.
    if (item.kind !== "portal_upload" || item.status !== "ready_for_portal") return false;
    return items.some((other) => other.kind === "rfce" && other.caseId === item.caseId && isAccepted(other));
  }
  return item.kind === "ecf" && isAccepted(item);
}

/** Per slot, the accepted signed document with the lowest e-NCF; `item` is null for a missing slot. */
export function pickPrintedSlots(items: SubmissionItem[]): SlotPick[] {
  return PRINTED_SLOTS.map((slot) => {
    const candidates = items.filter((item) => eligibleFor(slot, item, items)).sort((a, b) => a.encf.localeCompare(b.encf));
    return { slot, item: candidates[0] ?? null };
  });
}

/** Spanish error when the parsed document does not belong in the slot (E32 amount split), else null. */
export function slotMismatch(slot: PrintedSlot, model: PrintedEcf): string | null {
  if (model.tipoEcf !== slot.tipoEcf) return `El documento ${model.encf} no es del tipo ${slot.tipoEcf}.`;
  if (slot.variant === "consumo_lt_250k" && !isConsumoUnder250k(model)) return `La factura ${model.encf} no es menor a 250 mil.`;
  if (slot.variant === "consumo_gte_250k" && isConsumoUnder250k(model)) return `La factura ${model.encf} es menor a 250 mil.`;
  return null;
}

export function printedFileName(slot: PrintedSlot, encf: string): string {
  const base = slot.inputName.replace(/[^\w-]+/g, "_");
  return `${base}_${encf.replace(/[^\w-]+/g, "_")}.pdf`;
}

/** "1234.5" -> "1,234.50"; values that are not numbers are returned unchanged. */
export function formatAmount(value: string | undefined): string {
  if (value === undefined) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || value.trim() === "") return value;
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

export const DOCUMENT_TITLES: Record<string, string> = {
  "31": "Factura de Crédito Fiscal Electrónica",
  "32": "Factura de Consumo Electrónica",
  "33": "Nota de Débito Electrónica",
  "34": "Nota de Crédito Electrónica",
  "41": "Comprobante Electrónico de Compras",
  "43": "Comprobante Electrónico para Gastos Menores",
  "44": "Comprobante Electrónico para Regímenes Especiales",
  "45": "Comprobante Electrónico Gubernamental",
  "46": "Comprobante Electrónico para Exportaciones",
  "47": "Comprobante Electrónico para Pagos al Exterior",
};

/** IndicadorFacturacion of an item line. */
const ITBIS_RATES: Record<string, number> = { "1": 0.18, "2": 0.16, "3": 0 };

/**
 * Per-line ITBIS amount for the RI "ITBIS" column (the XML carries no per-line ITBIS). MontoItem
 * excludes ITBIS unless IndicadorMontoGravado is "1" (prices include ITBIS). Exempt or non-billable
 * lines return undefined.
 */
export function itemItbisAmount(montoItem: string | undefined, indicadorFacturacion: string | undefined, indicadorMontoGravado: string | undefined): string | undefined {
  const rate = ITBIS_RATES[indicadorFacturacion ?? ""];
  const amount = Number(montoItem);
  if (rate === undefined || montoItem === undefined || !Number.isFinite(amount)) return undefined;
  const itbis = indicadorMontoGravado === "1" ? amount - amount / (1 + rate) : amount * rate;
  return (Math.round(itbis * 100) / 100).toFixed(2);
}

/** Exempt lines carry an "E" to the left of the description. */
export function isExemptItem(indicadorFacturacion: string | undefined): boolean {
  return indicadorFacturacion === "4";
}
