/**
 * 80 mm continuous-roll PDF of the DGII printed representation of a signed e-CF (Informe Técnico de
 * Representación Impresa): single column with issuer, document title and e-NCF, buyer, reference,
 * items, totals, and the QR with the security code and signature date at the bottom left. The page
 * height follows the content. Values are printed as signed; totals are never recomputed.
 */
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { PrintedEcf } from "./ecfPrintedRepresentation";
import { ROLL_WIDTH, layoutReceipt, type TextMeasure } from "./ecfReceiptLayout";

const PT = 25.4 / 72;

export interface PrintedPdfInput {
  model: PrintedEcf;
  qrUrl: string;
  securityCode: string;
}

/** Text measure backed by a throwaway jsPDF instance (same font metrics as the final document). */
export function jsPdfMeasure(): TextMeasure {
  const doc = new jsPDF({ unit: "mm", format: [ROLL_WIDTH, 200] });
  return {
    width(text, size, style) {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      return doc.getTextWidth(text);
    },
  };
}

/** Builds the PDF and returns its bytes. */
export async function buildPrintedPdf({ model, qrUrl, securityCode }: PrintedPdfInput): Promise<Uint8Array> {
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 });
  const layout = layoutReceipt(model, securityCode, jsPdfMeasure());
  const doc = new jsPDF({ unit: "mm", format: [layout.width, layout.height], orientation: "portrait", compress: true });
  doc.setDrawColor(160);
  doc.setLineWidth(0.2);
  for (const box of layout.boxes) {
    if (box.kind === "text") {
      doc.setFont("helvetica", box.style);
      doc.setFontSize(box.size);
      doc.text(box.text, box.x, box.y + box.size * PT * 0.9);
    } else if (box.kind === "rule") {
      doc.line(box.x, box.y, box.x + box.w, box.y);
    } else {
      doc.addImage(qrDataUrl, "PNG", box.x, box.y, box.w, box.h);
    }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
