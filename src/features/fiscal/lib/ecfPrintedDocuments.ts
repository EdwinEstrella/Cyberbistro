/**
 * Step 5 of the DGII certification: turns a downloaded signed simulation e-CF into the PDF the admin
 * uploads to one portal slot. Pure apart from PDF generation; Spanish messages for the UI.
 */
import type { TestSetEnvironment } from "./ecfCertificationRun";
import { buildPrintedPdf } from "./ecfPrintedPdf";
import {
  buildPrintedQrUrl,
  dgiiEnvironmentSegment,
  parseSignedEcf,
  printedFileName,
  resolveSecurityCode,
  slotMismatch,
  type PrintedSlot,
} from "./ecfPrintedRepresentation";

/** The portal rejects uploads whose files add up to more than 10 MB. */
export const PORTAL_MAX_BYTES = 10 * 1024 * 1024;

export const MISSING_SLOT_MESSAGE = "La simulación no tiene un comprobante aceptado y firmado de este tipo.";

export interface PrintedDocument {
  fileName: string;
  bytes: Uint8Array;
  encf: string;
  qrUrl: string;
  securityCode: string;
}

export type PrintedDocumentOutcome = { ok: true; document: PrintedDocument } | { ok: false; message: string };

type XmlParser = Parameters<typeof parseSignedEcf>[1];

/** Parses the signed XML, checks it fits the slot, and builds its PDF with the DGII QR. */
export async function buildPrintedDocument(input: {
  slot: PrintedSlot;
  signedXml: string;
  storedSecurityCode?: string | null;
  environment: TestSetEnvironment;
  parser?: XmlParser;
}): Promise<PrintedDocumentOutcome> {
  let model;
  try {
    model = parseSignedEcf(input.signedXml, input.parser);
  } catch {
    return { ok: false, message: "No se pudo leer el XML firmado del comprobante." };
  }
  const mismatch = slotMismatch(input.slot, model);
  if (mismatch) return { ok: false, message: mismatch };
  try {
    const securityCode = resolveSecurityCode(model, input.storedSecurityCode);
    const qrUrl = buildPrintedQrUrl(model, { environment: dgiiEnvironmentSegment(input.environment), securityCode });
    const bytes = await buildPrintedPdf({ model, qrUrl, securityCode });
    return { ok: true, document: { fileName: printedFileName(input.slot, model.encf), bytes, encf: model.encf, qrUrl, securityCode } };
  } catch (error) {
    const missingDate = error instanceof Error && /FechaEmision|FechaHoraFirma/.test(error.message);
    return {
      ok: false,
      message: missingDate
        ? "El XML firmado no tiene la fecha de emisión o de firma necesaria para el QR."
        : "No se pudo generar el PDF del comprobante.",
    };
  }
}

export function totalBytes(documents: Array<PrintedDocument | null | undefined>): number {
  return documents.reduce((sum, document) => sum + (document?.bytes.length ?? 0), 0);
}

/** "12.3 KB" / "1.20 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
