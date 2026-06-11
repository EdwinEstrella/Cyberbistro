import { resolveNcfForNewInvoiceLocalFirst, enqueueLocalWrite } from "./localFirst";
import { construirCadenaNcf, etiquetaTipoNcf } from "./ncf";
import { type FiscalMode } from "./fiscalTypes";
import { insforgeClient } from "./insforge";
import { type TenantBillingSettings } from "./tenantBillingSettings";

const CERT_CACHE_KEY = (tenantId: string) => `ecf_cert_id_${tenantId}`;

export function getCachedCertificateId(tenantId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CERT_CACHE_KEY(tenantId));
}

export function setCachedCertificateId(tenantId: string, id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(CERT_CACHE_KEY(tenantId), id);
  } else {
    localStorage.removeItem(CERT_CACHE_KEY(tenantId));
  }
}

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

  let certificateId = getCachedCertificateId(tenantId);

  if (isOnline) {
    try {
      const { data: cert } = await insforgeClient.database
        .from("ecf_certificate_metadata")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_ready", true)
        .maybeSingle();

      if (cert?.id) {
        certificateId = cert.id;
        setCachedCertificateId(tenantId, certificateId);
      } else {
        certificateId = null;
        setCachedCertificateId(tenantId, null);
      }
    } catch (err) {
      console.warn("Failed to check certificate readiness online, using cache:", err);
    }
  }

  if (!certificateId) {
    const fallbackMode = settings.fiscalModeFallback || "internal_receipt";
    return { mode: fallbackMode, certificateId: null };
  }

  return { mode: "dgii_ecf", certificateId };
}

export interface FiscalEngineResult {
  ncf: string | null;
  ncf_tipo: string | null;
  tipoCodigo: string | null;
  usedSequence: number | null;
  sequenceReservedAtomically?: boolean;
  reservationSource?: string;
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
    const ncf = construirCadenaNcf(typeCode, args.numeroFactura);
    if (!ncf) {
      throw new Error("No se pudo construir el e-NCF.");
    }
    const ncf_tipo = etiquetaTipoNcf(typeCode);

    const ecfDocumentId = crypto.randomUUID();
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
        ecf_type: ecfType,
        status: "pending_sync",
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
        status: "queued",
        attempts: 0,
        next_attempt_at: now,
        idempotency_key: `${args.tenantId}:${args.facturaId}:submit`,
        created_at: now,
        updated_at: now,
      },
      deviceId: args.deviceId,
    });

    return {
      ncf,
      ncf_tipo,
      tipoCodigo: typeCode,
      usedSequence: args.numeroFactura,
      sequenceReservedAtomically: true,
      reservationSource: "dgii_ecf_engine",
    };
  }

  return null;
}
