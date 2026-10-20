/**
 * Pure layout of the printed representation on an 80 mm continuous roll. It measures text through an
 * injected `measure` and returns positioned boxes, so the PDF renderer only draws them and tests can
 * assert that nothing overlaps or leaves the margins. Every line advances y by its own height.
 */
import { DOCUMENT_TITLES, formatAmount, isExemptItem, itemItbisAmount, type PrintedEcf, type TotalField } from "./ecfPrintedRepresentation";

export type FontStyle = "normal" | "bold" | "italic";

export interface TextMeasure {
  /** Rendered width in mm of `text` at `size` pt. */
  width(text: string, size: number, style: FontStyle): number;
}

export interface TextBox {
  kind: "text";
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  style: FontStyle;
}
export interface RuleBox {
  kind: "rule";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface QrBox {
  kind: "qr";
  x: number;
  y: number;
  w: number;
  h: number;
}
export type LayoutBox = TextBox | RuleBox | QrBox;

export interface ReceiptLayout {
  width: number;
  height: number;
  boxes: LayoutBox[];
}

export const ROLL_WIDTH = 80;
export const SIDE_MARGIN = 4;
const CONTENT_WIDTH = ROLL_WIDTH - SIDE_MARGIN * 2;
const RIGHT = ROLL_WIDTH - SIDE_MARGIN;
const GAP = 2;
const PT = 25.4 / 72;
const lineHeight = (size: number) => size * PT * 1.2;

export const QR_SIZE = 25;
/** DGII: QR starts at least 2 cm from the sheet's left edge, plus a 3 mm quiet zone around it. */
export const QR_LEFT = 23;
const QR_QUIET = 3;
/** The QR ends at least 2 cm (plus quiet zone) above the bottom edge of the roll. */
export const QR_BOTTOM_CLEARANCE = 23;

const TOTAL_LABELS: Array<[TotalField, string]> = [
  ["MontoGravadoTotal", "Subtotal gravado"],
  ["MontoGravadoI1", "Gravado ITBIS 18%"],
  ["MontoGravadoI2", "Gravado ITBIS 16%"],
  ["MontoGravadoI3", "Gravado ITBIS 0%"],
  ["MontoExento", "Exento"],
  ["TotalITBIS1", "ITBIS 18%"],
  ["TotalITBIS2", "ITBIS 16%"],
  ["TotalITBIS3", "ITBIS 0%"],
  ["TotalITBIS", "Total ITBIS"],
  ["MontoImpuestoAdicional", "Impuestos adicionales"],
  ["MontoNoFacturable", "Monto no facturable"],
  ["MontoTotal", "Total"],
  ["TotalITBISRetenido", "ITBIS retenido"],
  ["TotalISRRetencion", "ISR retenido"],
  ["ValorPagar", "Valor a pagar"],
];

/** Greedy word wrap; a token wider than the line (e.g. a long e-mail) is broken by characters. */
export function wrapText(text: string, maxWidth: number, size: number, style: FontStyle, measure: TextMeasure): string[] {
  const fits = (value: string) => measure.width(value, size, style) <= maxWidth;
  const lines: string[] = [];
  let current = "";
  const push = (word: string) => {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      return;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (fits(word)) {
      current = word;
      return;
    }
    let chunk = "";
    for (const char of word) {
      if (chunk && !fits(chunk + char)) {
        lines.push(chunk);
        chunk = "";
      }
      chunk += char;
    }
    current = chunk;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) push(word);
  if (current) lines.push(current);
  return lines;
}

export function layoutReceipt(model: PrintedEcf, securityCode: string, measure: TextMeasure): ReceiptLayout {
  const boxes: LayoutBox[] = [];
  let y = SIDE_MARGIN;

  const place = (text: string, x: number, size: number, style: FontStyle, rightAlignTo?: number) => {
    const w = measure.width(text, size, style);
    boxes.push({ kind: "text", text, x: rightAlignTo === undefined ? x : rightAlignTo - w, y, w, h: lineHeight(size), size, style });
    return w;
  };
  /** Wrapped paragraph, one line per advance. */
  const paragraph = (text: string, size = 8, style: FontStyle = "normal", x = SIDE_MARGIN, maxWidth = CONTENT_WIDTH) => {
    for (const line of wrapText(text, maxWidth, size, style, measure)) {
      place(line, x, size, style);
      y += lineHeight(size);
    }
  };
  /** Label left, amount right on the same line when both fit with a gap; otherwise stacked. */
  const pair = (label: string, amount: string, size: number, style: FontStyle) => {
    if (measure.width(label, size, style) + GAP + measure.width(amount, size, style) <= CONTENT_WIDTH) {
      place(label, SIDE_MARGIN, size, style);
      place(amount, 0, size, style, RIGHT);
      y += lineHeight(size);
      return;
    }
    paragraph(label, size, style);
    place(amount, 0, size, style, RIGHT);
    y += lineHeight(size);
  };
  const rule = () => {
    y += 1;
    boxes.push({ kind: "rule", x: SIDE_MARGIN, y, w: CONTENT_WIDTH, h: 0.2 });
    y += 1.8;
  };

  // Issuer.
  const emisor = model.emisor;
  paragraph(emisor.razonSocial ?? emisor.rnc, 10, "bold");
  if (emisor.nombreComercial && emisor.nombreComercial !== emisor.razonSocial) paragraph(emisor.nombreComercial, 8);
  paragraph(`RNC: ${emisor.rnc}`);
  if (emisor.direccion) paragraph(emisor.direccion);
  const locality = [emisor.municipio, emisor.provincia].filter(Boolean).join(", ");
  if (locality) paragraph(locality);
  if (emisor.telefonos.length) paragraph(`Tel.: ${emisor.telefonos.join(" / ")}`);
  if (emisor.correo) paragraph(emisor.correo);
  if (emisor.fechaEmision) paragraph(`Fecha de emisión: ${emisor.fechaEmision}`);
  rule();

  // Document identity.
  paragraph(DOCUMENT_TITLES[model.tipoEcf] ?? `e-CF tipo ${model.tipoEcf}`, 9, "bold");
  paragraph(`e-NCF: ${model.encf}`, 9, "bold");
  if (model.fechaVencimientoSecuencia) paragraph(`Fecha de vencimiento: ${model.fechaVencimientoSecuencia}`);
  if (model.fechaLimitePago) paragraph(`Fecha límite de pago: ${model.fechaLimitePago}`);
  rule();

  // Buyer.
  const comprador = model.comprador;
  if (comprador) {
    if (comprador.rnc) paragraph(`RNC/Cédula comprador: ${comprador.rnc}`);
    else if (comprador.identificadorExtranjero) paragraph(`Identificador extranjero: ${comprador.identificadorExtranjero}`);
    if (comprador.razonSocial) paragraph(`Razón social comprador: ${comprador.razonSocial}`);
    if (comprador.direccion) paragraph(`Dirección: ${comprador.direccion}`);
    y += 1;
  }

  // Modified document (notes).
  const referencia = model.referencia;
  if (referencia?.ncfModificado) {
    paragraph(`NCF modificado: ${referencia.ncfModificado}`, 8, "bold");
    if (referencia.fechaNcfModificado) paragraph(`Fecha NCF modificado: ${referencia.fechaNcfModificado}`);
    if (referencia.codigoModificacion) paragraph(`Código de modificación: ${referencia.codigoModificacion}`);
    if (referencia.razonModificacion) paragraph(`Razón de modificación: ${referencia.razonModificacion}`);
    y += 1;
  }

  // Items: description (with the exempt marker), then quantity x price, ITBIS and value.
  const markerWidth = measure.width("E", 8, "bold") + 1.5;
  for (const item of model.items) {
    const exempt = isExemptItem(item.indicadorFacturacion);
    const indent = exempt ? markerWidth : 0;
    const description = wrapText(item.nombreItem || "—", CONTENT_WIDTH - indent, 8, "normal", measure);
    description.forEach((line, index) => {
      if (exempt && index === 0) place("E", SIDE_MARGIN, 8, "bold");
      place(line, SIDE_MARGIN + indent, 8, "normal");
      y += lineHeight(8);
    });
    const qtyPrice = [item.cantidadItem, item.precioUnitarioItem ? formatAmount(item.precioUnitarioItem) : undefined].filter(Boolean).join(" x ");
    const itbis = itemItbisAmount(item.montoItem, item.indicadorFacturacion, model.indicadorMontoGravado);
    const itbisText = itbis ? `ITBIS ${formatAmount(itbis)}` : "";
    const value = formatAmount(item.montoItem);
    const w = (text: string) => (text ? measure.width(text, 8, "normal") : 0);
    const parts = [qtyPrice, itbisText].filter(Boolean);
    if (w(qtyPrice) + w(itbisText) + w(value) + GAP * parts.length <= CONTENT_WIDTH) {
      if (qtyPrice) place(qtyPrice, SIDE_MARGIN, 8, "normal");
      if (itbisText) place(itbisText, 0, 8, "normal", RIGHT - w(value) - GAP);
      place(value, 0, 8, "normal", RIGHT);
      y += lineHeight(8);
    } else {
      // Not enough room for one row: qty x price + value, ITBIS on its own right-aligned line.
      if (qtyPrice) pair(qtyPrice, value, 8, "normal");
      else {
        place(value, 0, 8, "normal", RIGHT);
        y += lineHeight(8);
      }
      if (itbisText) {
        place(itbisText, 0, 8, "normal", RIGHT);
        y += lineHeight(8);
      }
    }
    const extra = (text: string, style: FontStyle) => paragraph(text, 7.5, style, SIDE_MARGIN + indent, CONTENT_WIDTH - indent);
    if (item.descuentoMonto && Number(item.descuentoMonto) !== 0) extra(`Descuento: ${formatAmount(item.descuentoMonto)}`, "normal");
    if (item.montoItbisRetenido) extra(`ITBIS retenido: ${formatAmount(item.montoItbisRetenido)}`, "italic");
    if (item.montoIsrRetenido) extra(`ISR retenido: ${formatAmount(item.montoIsrRetenido)}`, "italic");
    y += 0.8;
  }
  rule();

  // Totals.
  for (const [field, label] of TOTAL_LABELS) {
    if (model.totales[field] === undefined) continue;
    const strong = field === "MontoTotal" || field === "ValorPagar";
    pair(`${label}:`, formatAmount(model.totales[field]), strong ? 9 : 8, strong ? "bold" : "normal");
  }
  const otraMoneda = model.otraMoneda;
  if (otraMoneda?.tipoMoneda) {
    y += 1;
    paragraph(`Moneda: ${otraMoneda.tipoMoneda}`);
    if (otraMoneda.tipoCambio) paragraph(`Tipo de cambio: ${otraMoneda.tipoCambio}`);
    if (otraMoneda.montoTotalOtraMoneda) paragraph(`Total en ${otraMoneda.tipoMoneda}: ${formatAmount(otraMoneda.montoTotalOtraMoneda)}`);
  }

  // QR bottom left, security code and signature date directly under it.
  y += QR_QUIET + 2;
  boxes.push({ kind: "qr", x: QR_LEFT, y, w: QR_SIZE, h: QR_SIZE });
  const qrBottom = y + QR_SIZE;
  y = qrBottom + 1.5;
  const textWidth = RIGHT - QR_LEFT;
  paragraph(`Código de Seguridad: ${securityCode}`, 7.5, "bold", QR_LEFT, textWidth);
  paragraph(`Fecha de Firma Digital: ${model.fechaHoraFirma ?? ""}`, 7.5, "normal", QR_LEFT, textWidth);

  return { width: ROLL_WIDTH, height: Math.max(y, qrBottom + QR_BOTTOM_CLEARANCE), boxes };
}
