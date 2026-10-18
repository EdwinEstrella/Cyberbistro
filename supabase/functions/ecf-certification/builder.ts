// Builds e-CF and RFCE XML from the flat DGII test-set sheets ("Set de Pruebas").
// Each column name is mapped to its XML path (sections and nesting from dgii-ecf 1.8.0 IECF.ts /
// IRFCE.ts and the DGII e-CF format); `[n]` indices select repeated elements. The element order is
// the order in which the header first mentions each element, because the DGII sheet lists columns
// in schema order. Empty cells (and the DGII "#e" placeholder) are omitted, and so are containers
// left without values. Unknown columns that carry data fail loudly instead of being dropped.
import type { Sheet } from "./xlsx.ts";

export class TestSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSetError";
  }
}

export type DocumentKind = "ecf" | "rfce";

export interface BuiltDocument {
  kind: DocumentKind;
  /** CasoPrueba (RNC + eNCF). */
  caseId: string;
  encf: string;
  tipoEcf: string;
  rncEmisor: string;
  /** NCFModificado (notes and other modifying documents), when present. */
  references: string | null;
  /** Unsigned XML: e-CF without FechaHoraFirma, RFCE without CodigoSeguridadeCF (both set at signing). */
  xml: string;
}

export interface TestSet {
  ecf: BuiltDocument[];
  rfce: BuiltDocument[];
}

/**
 * Path syntax: segments separated by "/"; `Name[]` consumes the next column index as a repetition
 * of Name; `Name{1}` consumes an index that must be 1 (a single element the sheet indexes anyway).
 */
type PathTable = Record<string, string>;

function section(prefix: string, names: string[]): PathTable {
  return Object.fromEntries(names.map((name) => [name, `${prefix}/${name}`]));
}

const ECF_PATHS: PathTable = {
  Version: "Encabezado/Version",
  ...section("Encabezado/IdDoc", [
    "TipoeCF",
    "FechaVencimientoSecuencia",
    "IndicadorNotaCredito",
    "IndicadorEnvioDiferido",
    "IndicadorMontoGravado",
    "IndicadorServicioTodoIncluido",
    "TipoIngresos",
    "TipoPago",
    "FechaLimitePago",
    "TerminoPago",
    "TipoCuentaPago",
    "NumeroCuentaPago",
    "BancoPago",
    "FechaDesde",
    "FechaHasta",
    "TotalPaginas",
  ]),
  ENCF: "Encabezado/IdDoc/eNCF",
  "FormaPago[]": "Encabezado/IdDoc/TablaFormasPago/FormaDePago[]/FormaPago",
  "MontoPago[]": "Encabezado/IdDoc/TablaFormasPago/FormaDePago[]/MontoPago",
  ...section("Encabezado/Emisor", [
    "RNCEmisor",
    "RazonSocialEmisor",
    "NombreComercial",
    "Sucursal",
    "DireccionEmisor",
    "Municipio",
    "Provincia",
    "CorreoEmisor",
    "WebSite",
    "ActividadEconomica",
    "CodigoVendedor",
    "NumeroFacturaInterna",
    "NumeroPedidoInterno",
    "ZonaVenta",
    "RutaVenta",
    "InformacionAdicionalEmisor",
    "FechaEmision",
  ]),
  "TelefonoEmisor[]": "Encabezado/Emisor/TablaTelefonoEmisor/TelefonoEmisor[]",
  ...section("Encabezado/Comprador", [
    "RNCComprador",
    "IdentificadorExtranjero",
    "RazonSocialComprador",
    "ContactoComprador",
    "CorreoComprador",
    "DireccionComprador",
    "MunicipioComprador",
    "ProvinciaComprador",
    "PaisComprador",
    "FechaEntrega",
    "ContactoEntrega",
    "DireccionEntrega",
    "TelefonoAdicional",
    "FechaOrdenCompra",
    "NumeroOrdenCompra",
    "CodigoInternoComprador",
    "ResponsablePago",
    "InformacionAdicionalComprador",
  ]),
  ...section("Encabezado/InformacionesAdicionales", [
    "FechaEmbarque",
    "NumeroEmbarque",
    "NumeroContenedor",
    "NumeroReferencia",
    "NombrePuertoEmbarque",
    "CondicionesEntrega",
    "TotalFob",
    "Seguro",
    "Flete",
    "OtrosGastos",
    "TotalCif",
    "RegimenAduanero",
    "NombrePuertoSalida",
    "NombrePuertoDesembarque",
    "PesoBruto",
    "PesoNeto",
    "UnidadPesoBruto",
    "UnidadPesoNeto",
    "CantidadBulto",
    "UnidadBulto",
    "VolumenBulto",
    "UnidadVolumen",
  ]),
  ...section("Encabezado/Transporte", [
    "ViaTransporte",
    "PaisOrigen",
    "DireccionDestino",
    "PaisDestino",
    "RNCIdentificacionCompaniaTransportista",
    "NombreCompaniaTransportista",
    "NumeroViaje",
    "Conductor",
    "DocumentoTransporte",
    "Ficha",
    "Placa",
    "RutaTransporte",
    "ZonaTransporte",
    "NumeroAlbaran",
  ]),
  ...section("Encabezado/Totales", [
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
    "MontoPeriodo",
    "SaldoAnterior",
    "MontoAvancePago",
    "ValorPagar",
    "TotalITBISRetenido",
    "TotalISRRetencion",
    "TotalITBISPercepcion",
    "TotalISRPercepcion",
  ]),
  ...Object.fromEntries(
    [
      "TipoImpuesto",
      "TasaImpuestoAdicional",
      "MontoImpuestoSelectivoConsumoEspecifico",
      "MontoImpuestoSelectivoConsumoAdvalorem",
      "OtrosImpuestosAdicionales",
    ].map((name) => [`${name}[]`, `Encabezado/Totales/ImpuestosAdicionales/ImpuestoAdicional[]/${name}`]),
  ),
  ...section("Encabezado/OtraMoneda", [
    "TipoMoneda",
    "TipoCambio",
    "MontoGravadoTotalOtraMoneda",
    "MontoGravado1OtraMoneda",
    "MontoGravado2OtraMoneda",
    "MontoGravado3OtraMoneda",
    "MontoExentoOtraMoneda",
    "TotalITBISOtraMoneda",
    "TotalITBIS1OtraMoneda",
    "TotalITBIS2OtraMoneda",
    "TotalITBIS3OtraMoneda",
    "MontoImpuestoAdicionalOtraMoneda",
    "MontoTotalOtraMoneda",
  ]),
  ...Object.fromEntries(
    [
      "TipoImpuestoOtraMoneda",
      "TasaImpuestoAdicionalOtraMoneda",
      "MontoImpuestoSelectivoConsumoEspecificoOtraMoneda",
      "MontoImpuestoSelectivoConsumoAdvaloremOtraMoneda",
      "OtrosImpuestosAdicionalesOtraMoneda",
    ].map((name) => [`${name}[]`, `Encabezado/OtraMoneda/ImpuestosAdicionalesOtraMoneda/ImpuestoAdicionalOtraMoneda[]/${name}`]),
  ),
  // Detail lines: DetallesItems/Item[n] and their sub-tables Name[n][k].
  ...Object.fromEntries(
    [
      "NumeroLinea",
      "IndicadorFacturacion",
      "NombreItem",
      "IndicadorBienoServicio",
      "DescripcionItem",
      "CantidadItem",
      "UnidadMedida",
      "CantidadReferencia",
      "UnidadReferencia",
      "GradosAlcohol",
      "PrecioUnitarioReferencia",
      "FechaElaboracion",
      "FechaVencimientoItem",
      "PrecioUnitarioItem",
      "DescuentoMonto",
      "RecargoMonto",
      "MontoItem",
    ].map((name) => [`${name}[]`, `DetallesItems/Item[]/${name}`]),
  ),
  ...Object.fromEntries(
    ["IndicadorAgenteRetencionoPercepcion", "MontoITBISRetenido", "MontoISRRetenido"].map((name) => [
      `${name}[]`,
      `DetallesItems/Item[]/Retencion/${name}`,
    ]),
  ),
  ...Object.fromEntries(
    ["PesoNetoKilogramo", "PesoNetoMineria", "TipoAfiliacion", "Liquidacion"].map((name) => [`${name}[]`, `DetallesItems/Item[]/Mineria/${name}`]),
  ),
  ...Object.fromEntries(
    ["PrecioOtraMoneda", "DescuentoOtraMoneda", "RecargoOtraMoneda", "MontoItemOtraMoneda"].map((name) => [
      `${name}[]`,
      `DetallesItems/Item[]/OtraMonedaDetalle/${name}`,
    ]),
  ),
  "TipoCodigo[][]": "DetallesItems/Item[]/TablaCodigosItem/CodigosItem[]/TipoCodigo",
  "CodigoItem[][]": "DetallesItems/Item[]/TablaCodigosItem/CodigosItem[]/CodigoItem",
  "Subcantidad[][]": "DetallesItems/Item[]/TablaSubcantidad/SubcantidadItem[]/Subcantidad",
  "CodigoSubcantidad[][]": "DetallesItems/Item[]/TablaSubcantidad/SubcantidadItem[]/CodigoSubcantidad",
  "TipoSubDescuento[][]": "DetallesItems/Item[]/TablaSubDescuento/SubDescuento[]/TipoSubDescuento",
  "SubDescuentoPorcentaje[][]": "DetallesItems/Item[]/TablaSubDescuento/SubDescuento[]/SubDescuentoPorcentaje",
  "MontoSubDescuento[][]": "DetallesItems/Item[]/TablaSubDescuento/SubDescuento[]/MontoSubDescuento",
  "TipoSubRecargo[][]": "DetallesItems/Item[]/TablaSubRecargo/SubRecargo[]/TipoSubRecargo",
  "SubRecargoPorcentaje[][]": "DetallesItems/Item[]/TablaSubRecargo/SubRecargo[]/SubRecargoPorcentaje",
  // The DGII sheet spells this column "MontosubRecargo"; the schema element is MontoSubRecargo.
  "MontosubRecargo[][]": "DetallesItems/Item[]/TablaSubRecargo/SubRecargo[]/MontoSubRecargo",
  "MontoSubRecargo[][]": "DetallesItems/Item[]/TablaSubRecargo/SubRecargo[]/MontoSubRecargo",
  "TipoImpuesto[][]": "DetallesItems/Item[]/TablaImpuestoAdicional/ImpuestoAdicional[]/TipoImpuesto",
  ...section("Subtotales/Subtotal", [
    "NumeroSubTotal",
    "DescripcionSubtotal",
    "Orden",
    "SubTotalMontoGravadoTotal",
    "SubTotalMontoGravadoI1",
    "SubTotalMontoGravadoI2",
    "SubTotalMontoGravadoI3",
    "SubTotaITBIS",
    "SubTotaITBIS1",
    "SubTotaITBIS2",
    "SubTotaITBIS3",
    "SubTotalImpuestoAdicional",
    "SubTotalExento",
    "MontoSubTotal",
    "Lineas",
  ]),
  // The sheet names the global discount line number NumeroLineaDoR; the element is NumeroLinea.
  "NumeroLineaDoR[]": "DescuentosORecargos/DescuentoORecargo[]/NumeroLinea",
  ...Object.fromEntries(
    [
      "TipoAjuste",
      "IndicadorNorma1007",
      "DescripcionDescuentooRecargo",
      "TipoValor",
      "ValorDescuentooRecargo",
      "MontoDescuentooRecargo",
      "MontoDescuentooRecargoOtraMoneda",
      "IndicadorFacturacionDescuentooRecargo",
    ].map((name) => [`${name}[]`, `DescuentosORecargos/DescuentoORecargo[]/${name}`]),
  ),
  ...Object.fromEntries(
    [
      "PaginaNo",
      "NoLineaDesde",
      "NoLineaHasta",
      "SubtotalMontoGravadoPagina",
      "SubtotalMontoGravado1Pagina",
      "SubtotalMontoGravado2Pagina",
      "SubtotalMontoGravado3Pagina",
      "SubtotalExentoPagina",
      "SubtotalItbisPagina",
      "SubtotalItbis1Pagina",
      "SubtotalItbis2Pagina",
      "SubtotalItbis3Pagina",
      "SubtotalImpuestoAdicionalPagina",
      "MontoSubtotalPagina",
      "SubtotalMontoNoFacturablePagina",
    ].map((name) => [`${name}[]`, `Paginacion/Pagina[]/${name}`]),
  ),
  "SubtotalImpuestoSelectivoConsumoEspecificoPagina[][]":
    "Paginacion/Pagina[]/SubtotalImpuestoAdicional{1}/SubtotalImpuestoSelectivoConsumoEspecificoPagina",
  "SubtotalOtrosImpuesto[][]": "Paginacion/Pagina[]/SubtotalImpuestoAdicional{1}/SubtotalOtrosImpuesto",
  ...section("InformacionReferencia", ["NCFModificado", "RNCOtroContribuyente", "FechaNCFModificado", "CodigoModificacion", "RazonModificacion"]),
};

const RFCE_PATHS: PathTable = {
  Version: "Encabezado/Version",
  ...section("Encabezado/IdDoc", ["TipoeCF", "TipoIngresos", "TipoPago"]),
  ENCF: "Encabezado/IdDoc/eNCF",
  "FormaPago[]": "Encabezado/IdDoc/TablaFormasPago/FormaDePago[]/FormaPago",
  "MontoPago[]": "Encabezado/IdDoc/TablaFormasPago/FormaDePago[]/MontoPago",
  ...section("Encabezado/Emisor", ["RNCEmisor", "RazonSocialEmisor", "FechaEmision"]),
  ...section("Encabezado/Comprador", ["RNCComprador", "IdentificadorExtranjero", "RazonSocialComprador"]),
  ...section("Encabezado/Totales", [
    "MontoGravadoTotal",
    "MontoGravadoI1",
    "MontoGravadoI2",
    "MontoGravadoI3",
    "MontoExento",
    "TotalITBIS",
    "TotalITBIS1",
    "TotalITBIS2",
    "TotalITBIS3",
    "MontoImpuestoAdicional",
    "MontoTotal",
    "MontoNoFacturable",
    "MontoPeriodo",
  ]),
  ...Object.fromEntries(
    ["TipoImpuesto", "MontoImpuestoSelectivoConsumoEspecifico", "MontoImpuestoSelectivoConsumoAdvalorem", "OtrosImpuestosAdicionales"].map((name) => [
      `${name}[]`,
      `Encabezado/Totales/ImpuestosAdicionales/ImpuestoAdicional[]/${name}`,
    ]),
  ),
};

/** Columns that are read as metadata or filled by the signing step, never mapped from the sheet. */
const ECF_METADATA = new Set(["CasoPrueba"]);
const RFCE_METADATA = new Set(["CasoPrueba", "CodigoSeguridadeCF"]);
/** Layout-only columns of the DGII sheet; they must stay empty. */
const ECF_MARKERS = new Set(["SubtotalImpuestoAdicionalPaginaTabla[]"]);

export function isEmptyCell(value: string | undefined): boolean {
  return value === undefined || value.trim() === "" || value.trim() === "#e";
}

interface TemplateNode {
  name: string;
  children: Map<string, TemplateNode>;
  column: number | null;
}

interface Template {
  root: TemplateNode;
  columns: Map<string, number>;
  /** Unknown or marker columns that must stay empty in every row. */
  mustBeEmpty: Map<number, string>;
}

function parseHeader(raw: string): { base: string; indices: number[]; key: string } {
  const name = raw.trim();
  const match = name.match(/^([A-Za-z][A-Za-z0-9]*)((?:\[\d+\])*)$/);
  if (!match) return { base: name, indices: [], key: name };
  const indices = [...match[2].matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return { base: match[1], indices, key: `${match[1]}${"[]".repeat(indices.length)}` };
}

function buildTemplate(header: string[], paths: PathTable, metadata: Set<string>, markers: Set<string>, sheetName: string): Template {
  const root: TemplateNode = { name: "", children: new Map(), column: null };
  const columns = new Map<string, number>();
  const mustBeEmpty = new Map<number, string>();
  const seenLeaves = new Set<string>();
  header.forEach((rawName, column) => {
    const name = (rawName ?? "").trim();
    if (!name) {
      mustBeEmpty.set(column, `(unnamed column ${column + 1})`);
      return;
    }
    const { indices, key } = parseHeader(name);
    if (metadata.has(name)) {
      if (columns.has(name)) throw new TestSetError(`Sheet ${sheetName}: duplicated column ${name}.`);
      columns.set(name, column);
      return;
    }
    if (markers.has(key)) {
      mustBeEmpty.set(column, name);
      return;
    }
    const path = Object.prototype.hasOwnProperty.call(paths, key) ? paths[key] : undefined;
    if (!path) {
      mustBeEmpty.set(column, name);
      return;
    }
    let node = root;
    let used = 0;
    const leafKey: string[] = [];
    for (const segment of path.split("/")) {
      let element = segment;
      let childKey = segment;
      if (segment.endsWith("[]")) {
        element = segment.slice(0, -2);
        childKey = `${element}#${indices[used++]}`;
      } else if (segment.endsWith("{1}")) {
        element = segment.slice(0, -3);
        const index = indices[used++];
        if (index !== 1) {
          // Only a single element exists in the schema: an index other than 1 must not carry data.
          mustBeEmpty.set(column, name);
          return;
        }
        childKey = element;
      }
      leafKey.push(childKey);
      let child = node.children.get(childKey);
      if (!child) {
        child = { name: element, children: new Map(), column: null };
        node.children.set(childKey, child);
      }
      node = child;
    }
    if (used !== indices.length) throw new TestSetError(`Sheet ${sheetName}: column ${name} has unexpected indices.`);
    const id = leafKey.join("/");
    if (seenLeaves.has(id) || node.children.size > 0) throw new TestSetError(`Sheet ${sheetName}: column ${name} maps to an element that is already mapped.`);
    seenLeaves.add(id);
    node.column = column;
  });
  return { root, columns, mustBeEmpty };
}

export function escapeXml(value: string): string {
  // Text content only: quotes stay literal so the values read exactly as in the sheet.
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(node: TemplateNode, row: string[]): string {
  if (node.column !== null) {
    const value = row[node.column];
    return isEmptyCell(value) ? "" : `<${node.name}>${escapeXml(value)}</${node.name}>`;
  }
  let inner = "";
  for (const child of node.children.values()) inner += render(child, row);
  return inner ? `<${node.name}>${inner}</${node.name}>` : "";
}

const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';

function cell(row: string[], template: Template, column: string): string {
  const index = template.columns.get(column) ?? -1;
  const value = index >= 0 ? row[index] : undefined;
  return isEmptyCell(value) ? "" : value!.trim();
}

function leafValue(template: Template, row: string[], path: string[]): string {
  let node: TemplateNode | undefined = template.root;
  for (const key of path) node = node?.children.get(key);
  if (!node || node.column === null) return "";
  const value = row[node.column];
  return isEmptyCell(value) ? "" : value.trim();
}

function buildSheet(sheet: Sheet, kind: DocumentKind): BuiltDocument[] {
  const paths = kind === "ecf" ? ECF_PATHS : RFCE_PATHS;
  const template = buildTemplate(sheet.rows[0] ?? [], paths, kind === "ecf" ? ECF_METADATA : RFCE_METADATA, kind === "ecf" ? ECF_MARKERS : new Set(), sheet.name);
  if (!template.columns.has("CasoPrueba")) throw new TestSetError(`Sheet ${sheet.name}: the CasoPrueba column is missing.`);
  const rootName = kind === "ecf" ? "ECF" : "RFCE";
  const out: BuiltDocument[] = [];
  const seen = new Set<string>();
  sheet.rows.slice(1).forEach((row, offset) => {
    if (row.every((value) => isEmptyCell(value))) return;
    const line = offset + 2;
    for (const [column, name] of template.mustBeEmpty) {
      if (!isEmptyCell(row[column])) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: column ${name} is not supported but has a value.`);
    }
    const caseId = cell(row, template, "CasoPrueba");
    const encf = leafValue(template, row, ["Encabezado", "IdDoc", "eNCF"]);
    const tipoEcf = leafValue(template, row, ["Encabezado", "IdDoc", "TipoeCF"]);
    const rncEmisor = leafValue(template, row, ["Encabezado", "Emisor", "RNCEmisor"]);
    if (!/^E\d{12}$/.test(encf)) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: ENCF is missing or invalid.`);
    if (tipoEcf !== encf.slice(1, 3)) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: TipoeCF does not match ENCF ${encf}.`);
    if (!/^\d{9}(\d{2})?$/.test(rncEmisor)) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: RNCEmisor is missing or invalid.`);
    if (caseId !== `${rncEmisor}${encf}`) throw new TestSetError(`Sheet ${sheet.name}, row ${line}: CasoPrueba does not match RNCEmisor + ENCF.`);
    if (seen.has(encf)) throw new TestSetError(`Sheet ${sheet.name}: ENCF ${encf} appears more than once.`);
    seen.add(encf);
    let inner = "";
    for (const child of template.root.children.values()) inner += render(child, row);
    const references = kind === "ecf" ? leafValue(template, row, ["InformacionReferencia", "NCFModificado"]) || null : null;
    out.push({ kind, caseId, encf, tipoEcf, rncEmisor, references, xml: `${XML_DECLARATION}<${rootName}>${inner}</${rootName}>` });
  });
  return out;
}

/** Parses the DGII test-set workbook: sheet ECF (required) and sheet RFCE (consumo < 250k). */
export function buildTestSet(sheets: Sheet[]): TestSet {
  const find = (name: string) => sheets.find((sheet) => sheet.name.trim().toUpperCase() === name);
  const ecfSheet = find("ECF");
  if (!ecfSheet) throw new TestSetError("The workbook has no ECF sheet.");
  const ecf = buildSheet(ecfSheet, "ecf");
  if (ecf.length === 0) throw new TestSetError("The ECF sheet has no test cases.");
  const rfceSheet = find("RFCE");
  const rfce = rfceSheet ? buildSheet(rfceSheet, "rfce") : [];
  for (const summary of rfce) {
    const source = ecf.find((doc) => doc.encf === summary.encf);
    if (!source || source.tipoEcf !== "32" || summary.tipoEcf !== "32") {
      throw new TestSetError(`Sheet RFCE: ${summary.encf} has no matching E32 in the ECF sheet.`);
    }
  }
  return { ecf, rfce };
}

/** DGII signature timestamp in Dominican Republic time (UTC-4, no daylight saving): dd-MM-yyyy HH:mm:ss. */
export function formatDgiiDateTime(date: Date): string {
  const local = new Date(date.getTime() - 4 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(local.getUTCDate())}-${pad(local.getUTCMonth() + 1)}-${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

/** Adds FechaHoraFirma as the last child of ECF (right before the signature the signer appends). */
export function stampSignatureTime(ecfXml: string, date: Date): string {
  if (ecfXml.includes("<FechaHoraFirma>")) throw new TestSetError("The e-CF already has FechaHoraFirma.");
  if (!ecfXml.endsWith("</ECF>")) throw new TestSetError("The e-CF is not an unsigned ECF document.");
  return `${ecfXml.slice(0, -"</ECF>".length)}<FechaHoraFirma>${formatDgiiDateTime(date)}</FechaHoraFirma></ECF>`;
}

/**
 * CodigoSeguridadeCF of a signed e-CF: the first six characters of its SignatureValue
 * (same rule as dgii-ecf getCodeSixDigitfromSignature).
 */
export function securityCodeFromSignedXml(signedXml: string): string {
  const match = signedXml.match(/<(?:[A-Za-z_][\w.-]*:)?SignatureValue\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?SignatureValue>/);
  const value = match?.[1].replace(/\s+/g, "") ?? "";
  if (value.length < 6) throw new TestSetError("The signed e-CF has no SignatureValue.");
  return value.slice(0, 6);
}

/** Sets CodigoSeguridadeCF as the last child of RFCE/Encabezado. */
export function applySecurityCode(rfceXml: string, securityCode: string): string {
  if (!/^[A-Za-z0-9+/=]{6}$/.test(securityCode)) throw new TestSetError("Invalid security code.");
  if (rfceXml.includes("<CodigoSeguridadeCF>")) throw new TestSetError("The RFCE already has CodigoSeguridadeCF.");
  const tail = "</Encabezado></RFCE>";
  if (!rfceXml.endsWith(tail)) throw new TestSetError("The RFCE is not an unsigned RFCE document.");
  return `${rfceXml.slice(0, -tail.length)}<CodigoSeguridadeCF>${escapeXml(securityCode)}</CodigoSeguridadeCF>${tail}`;
}
