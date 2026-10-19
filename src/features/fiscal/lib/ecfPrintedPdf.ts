/**
 * A4 PDF of the DGII printed representation of a signed e-CF (Informe Técnico de Representación
 * Impresa): issuer header, document title and e-NCF, buyer, reference, items, totals, and the QR
 * with the security code and signature date at the bottom left. Values are printed as signed;
 * totals are never recomputed.
 */
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { DOCUMENT_TITLES, formatAmount, isExemptItem, itemItbisAmount, type PrintedEcf, type TotalField } from "./ecfPrintedRepresentation";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const QR_SIZE = 30;
/** DGII: QR starts at least 2 cm from the sheet edge, plus a 3 mm quiet margin around it. */
const QR_EDGE_OFFSET = 20 + 3;
/** QR plus the two lines under it. */
const QR_BLOCK_HEIGHT = QR_SIZE + 12;
const LINE = 4.5;

const COLUMNS = [
  { title: "Cant.", width: 18, align: "right" as const },
  { title: "Descripción", width: 72, align: "left" as const },
  { title: "Precio unitario", width: 30, align: "right" as const },
  { title: "ITBIS", width: 25, align: "right" as const },
  { title: "Valor", width: 35, align: "right" as const },
];

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

export interface PrintedPdfInput {
  model: PrintedEcf;
  qrUrl: string;
  securityCode: string;
}

/** Builds the PDF and returns its bytes. */
export async function buildPrintedPdf({ model, qrUrl, securityCode }: PrintedPdfInput): Promise<Uint8Array> {
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setFont("helvetica", "normal");
  let y = MARGIN;

  const write = (value: string, x: number, size = 9, style: "normal" | "bold" = "normal", align: "left" | "right" = "left") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.text(value, x, y, { align });
  };
  const ensureSpace = (height: number, reserve = 0) => {
    if (y + height > PAGE_HEIGHT - MARGIN - reserve) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  // Header: issuer on the left, document identity on the right.
  const emisor = model.emisor;
  const left = [
    emisor.nombreComercial && emisor.nombreComercial !== emisor.razonSocial ? emisor.nombreComercial : undefined,
    `RNC: ${emisor.rnc}`,
    emisor.direccion,
    [emisor.municipio, emisor.provincia].filter(Boolean).join(", ") || undefined,
    emisor.telefonos.length ? `Tel.: ${emisor.telefonos.join(" / ")}` : undefined,
    emisor.correo,
    emisor.fechaEmision ? `Fecha de emisión: ${emisor.fechaEmision}` : undefined,
  ].filter((line): line is string => !!line);
  const headerTop = y;
  y += 5;
  write(emisor.razonSocial ?? emisor.rnc, MARGIN, 13, "bold");
  doc.setFontSize(9);
  const leftLines = left.flatMap((line) => doc.splitTextToSize(line, 100) as string[]);
  for (const line of leftLines) {
    y += LINE;
    write(line, MARGIN);
  }
  const leftBottom = y;

  y = headerTop + 5;
  const right = PAGE_WIDTH - MARGIN;
  for (const part of doc.setFont("helvetica", "bold").setFontSize(11).splitTextToSize(DOCUMENT_TITLES[model.tipoEcf] ?? `e-CF tipo ${model.tipoEcf}`, 80) as string[]) {
    write(part, right, 11, "bold", "right");
    y += 5;
  }
  write(`e-NCF: ${model.encf}`, right, 10, "bold", "right");
  if (model.fechaVencimientoSecuencia) {
    y += LINE;
    write(`Fecha de vencimiento: ${model.fechaVencimientoSecuencia}`, right, 9, "normal", "right");
  }
  if (model.fechaLimitePago) {
    y += LINE;
    write(`Fecha límite de pago: ${model.fechaLimitePago}`, right, 9, "normal", "right");
  }
  y = Math.max(leftBottom, y) + 4;
  doc.setDrawColor(160);
  doc.line(MARGIN, y, right, y);
  y += 6;

  // Buyer.
  const comprador = model.comprador;
  if (comprador) {
    if (comprador.rnc) {
      write(`RNC/Cédula comprador: ${comprador.rnc}`, MARGIN);
      y += LINE;
    } else if (comprador.identificadorExtranjero) {
      write(`Identificador extranjero: ${comprador.identificadorExtranjero}`, MARGIN);
      y += LINE;
    }
    if (comprador.razonSocial) {
      write(`Razón social comprador: ${comprador.razonSocial}`, MARGIN);
      y += LINE;
    }
    if (comprador.direccion) {
      write(`Dirección: ${comprador.direccion}`, MARGIN);
      y += LINE;
    }
    y += 2;
  }

  // Modified document (notes).
  const referencia = model.referencia;
  if (referencia?.ncfModificado) {
    write(`NCF modificado: ${referencia.ncfModificado}`, MARGIN, 9, "bold");
    y += LINE;
    if (referencia.fechaNcfModificado) {
      write(`Fecha NCF modificado: ${referencia.fechaNcfModificado}`, MARGIN);
      y += LINE;
    }
    if (referencia.codigoModificacion) {
      write(`Código de modificación: ${referencia.codigoModificacion}`, MARGIN);
      y += LINE;
    }
    if (referencia.razonModificacion) {
      for (const part of doc.setFontSize(9).splitTextToSize(`Razón de modificación: ${referencia.razonModificacion}`, CONTENT_WIDTH) as string[]) {
        write(part, MARGIN);
        y += LINE;
      }
    }
    y += 2;
  }

  // Items table.
  const drawHeaderRow = () => {
    doc.setFillColor(235, 235, 235);
    doc.rect(MARGIN, y - 4, CONTENT_WIDTH, 6, "F");
    let x = MARGIN;
    for (const column of COLUMNS) {
      write(column.title, column.align === "right" ? x + column.width - 1 : x + 1, 8, "bold", column.align);
      x += column.width;
    }
    y += 5;
  };
  ensureSpace(12);
  drawHeaderRow();
  for (const item of model.items) {
    doc.setFontSize(8);
    const name = item.nombreItem || "—";
    const description = doc.splitTextToSize(isExemptItem(item.indicadorFacturacion) ? `E  ${name}` : name, COLUMNS[1].width - 2) as string[];
    const retention = [
      item.montoItbisRetenido ? `ITBIS retenido: ${formatAmount(item.montoItbisRetenido)}` : undefined,
      item.montoIsrRetenido ? `ISR retenido: ${formatAmount(item.montoIsrRetenido)}` : undefined,
    ].filter((line): line is string => !!line);
    const lines = [...description, ...retention];
    const height = lines.length * 3.8 + 1.5;
    if (ensureSpace(height)) drawHeaderRow();
    const cells = [
      item.cantidadItem ?? "",
      "",
      formatAmount(item.precioUnitarioItem),
      formatAmount(itemItbisAmount(item.montoItem, item.indicadorFacturacion, model.indicadorMontoGravado)),
      formatAmount(item.montoItem),
    ];
    let x = MARGIN;
    COLUMNS.forEach((column, index) => {
      if (index === 1) {
        lines.forEach((line, lineIndex) => {
          doc.setFont("helvetica", lineIndex < description.length ? "normal" : "italic");
          doc.setFontSize(8);
          doc.text(line, x + 1, y + lineIndex * 3.8);
        });
      } else {
        write(cells[index], column.align === "right" ? x + column.width - 1 : x + 1, 8, "normal", column.align);
      }
      x += column.width;
    });
    y += height;
    if (item.descuentoMonto && Number(item.descuentoMonto) !== 0) {
      ensureSpace(4);
      write(`Descuento: ${formatAmount(item.descuentoMonto)}`, MARGIN + COLUMNS[0].width + 1, 7.5);
      y += 3.8;
    }
  }
  doc.line(MARGIN, y - 2, right, y - 2);
  y += 3;

  // Totals, right aligned.
  const totals = TOTAL_LABELS.filter(([field]) => model.totales[field] !== undefined);
  for (const [field, label] of totals) {
    ensureSpace(LINE);
    const strong = field === "MontoTotal" || field === "ValorPagar";
    write(`${label}:`, right - 40, strong ? 10 : 9, strong ? "bold" : "normal", "right");
    write(formatAmount(model.totales[field]), right, strong ? 10 : 9, strong ? "bold" : "normal", "right");
    y += strong ? 5.5 : LINE;
  }
  const otraMoneda = model.otraMoneda;
  if (otraMoneda?.tipoMoneda) {
    ensureSpace(LINE);
    const parts = [
      `Moneda: ${otraMoneda.tipoMoneda}`,
      otraMoneda.tipoCambio ? `Tipo de cambio: ${otraMoneda.tipoCambio}` : undefined,
      otraMoneda.montoTotalOtraMoneda ? `Total en ${otraMoneda.tipoMoneda}: ${formatAmount(otraMoneda.montoTotalOtraMoneda)}` : undefined,
    ].filter(Boolean);
    write(parts.join("   "), right, 8.5, "normal", "right");
    y += LINE;
  }

  // QR at the bottom left of the last page, with the security code and signature date under it.
  if (y + 4 > PAGE_HEIGHT - QR_EDGE_OFFSET - QR_BLOCK_HEIGHT) doc.addPage();
  const qrTop = PAGE_HEIGHT - QR_EDGE_OFFSET - QR_BLOCK_HEIGHT;
  doc.addImage(qrDataUrl, "PNG", QR_EDGE_OFFSET, qrTop, QR_SIZE, QR_SIZE);
  y = qrTop + QR_SIZE + 4.5;
  write(`Código de Seguridad: ${securityCode}`, QR_EDGE_OFFSET, 9, "bold");
  y += LINE;
  write(`Fecha de Firma Digital: ${model.fechaHoraFirma ?? ""}`, QR_EDGE_OFFSET, 9);

  return new Uint8Array(doc.output("arraybuffer"));
}
