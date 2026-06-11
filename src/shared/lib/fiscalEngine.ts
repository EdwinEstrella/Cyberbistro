import { resolveNcfForNewInvoiceLocalFirst, enqueueLocalWrite } from "./localFirst";

import { type FiscalMode } from "./fiscalTypes";
import { insforgeClient } from "./insforge";
import { type TenantBillingSettings } from "./tenantBillingSettings";

export async function resolveActiveFiscalMode(
  tenantId: string,
  settings: TenantBillingSettings | null,
  isOnline: boolean
): Promise<{ mode: FiscalMode; certificateId: string | null }> {
  if (!settings) {
    return { mode: "internal_receipt", certificateId: null };
  }

  if (settings.fiscalMode !== "dgii_ecf") {
    return { mode: settings.fiscalMode, certificateId: null };
  }

  if (isOnline) {
    try {
      const { data: cert } = await insforgeClient.database
        .from("ecf_certificate_metadata")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_ready", true)
        .maybeSingle();

      if (cert?.id) {
        return { mode: "dgii_ecf", certificateId: cert.id };
      }
    } catch (err) {
      console.warn("Failed to check certificate readiness online, keeping e-CF pending for backend validation:", err);
      return { mode: "dgii_ecf", certificateId: null };
    }

    const fallbackMode = settings.fiscalModeFallback || "internal_receipt";
    return { mode: fallbackMode, certificateId: null };
  }

  return { mode: "dgii_ecf", certificateId: null };
}

export interface FiscalEngineResult {
  ncf: string | null;
  ncf_tipo: string | null;
  tipoCodigo: string | null;
  usedSequence: number | null;
  sequenceReservedAtomically?: boolean;
  reservationSource?: string;
  certificateId?: string | null;
  ecfType?: string;
}

export async function runFiscalEngine(args: {
  tenantId: string;
  activeMode: FiscalMode;
  certificateId: string | null;
  facturaId: string;
  numeroFactura: number;
  clientRnc?: string | null;
  preferredNcfType?: string | null;
  deviceId: string;
}): Promise<FiscalEngineResult | null> {
  if (args.activeMode === "internal_receipt") {
    return null;
  }

  if (args.activeMode === "ncf_legacy") {
    const ncfPart = await resolveNcfForNewInvoiceLocalFirst(args.tenantId, args.preferredNcfType);
    if (!ncfPart) {
      throw new Error("No se pudo reservar NCF fiscal.");
    }
    return {
      ncf: ncfPart.ncf,
      ncf_tipo: ncfPart.ncf_tipo,
      tipoCodigo: ncfPart.tipoCodigo,
      usedSequence: ncfPart.usedSequence,
      sequenceReservedAtomically: ncfPart.sequenceReservedAtomically,
      reservationSource: ncfPart.reservationSource,
    };
  }

  if (args.activeMode === "dgii_ecf") {
    const clientRncTrimmed = args.clientRnc?.trim() || "";
    const ecfType = clientRncTrimmed !== "" ? "31" : "32";
    const typeCode = `E${ecfType}`;

    const ncfPart = await resolveNcfForNewInvoiceLocalFirst(args.tenantId, typeCode);
    if (!ncfPart) {
      throw new Error(`No se pudo reservar la secuencia para e-NCF tipo ${typeCode}.`);
    }

    return {
      ncf: ncfPart.ncf,
      ncf_tipo: ncfPart.ncf_tipo,
      tipoCodigo: ncfPart.tipoCodigo,
      usedSequence: ncfPart.usedSequence,
      sequenceReservedAtomically: ncfPart.sequenceReservedAtomically,
      reservationSource: ncfPart.reservationSource,
      certificateId: args.certificateId,
      ecfType,
    };
  }

  return null;
}

export async function enqueueEcfDocuments(args: {
  tenantId: string;
  facturaId: string;
  certificateId: string | null;
  ecfType: string;
  deviceId: string;
  ecfDocumentId?: string;
}) {
  const ecfDocumentId = args.ecfDocumentId || crypto.randomUUID();
  const now = new Date().toISOString();

  await enqueueLocalWrite({
    tenantId: args.tenantId,
    tableName: "ecf_documents",
    rowId: ecfDocumentId,
    op: "insert",
    payload: {
      id: ecfDocumentId,
      tenant_id: args.tenantId,
      factura_id: args.facturaId,
      certificate_metadata_id: args.certificateId,
      ecf_type: args.ecfType,
      status: "pending_offline",
      created_at: now,
      updated_at: now,
    },
    deviceId: args.deviceId,
  });

  const jobId = crypto.randomUUID();
  await enqueueLocalWrite({
    tenantId: args.tenantId,
    tableName: "fiscal_outbox",
    rowId: jobId,
    op: "insert",
    payload: {
      id: jobId,
      tenant_id: args.tenantId,
      ecf_document_id: ecfDocumentId,
      factura_id: args.facturaId,
      operation: "submit",
      status: "pending_sync",
      attempts: 0,
      next_attempt_at: now,
      idempotency_key: `${args.tenantId}:${args.facturaId}:submit`,
      created_at: now,
      updated_at: now,
    },
    deviceId: args.deviceId,
  });

  return { ecfDocumentId };
}
