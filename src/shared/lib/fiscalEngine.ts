import { resolveNcfForNewInvoiceLocalFirst, enqueueLocalWrite, type LocalFirstWrite } from "./localFirst";

import { type FiscalMode } from "./fiscalTypes";
import { supabase } from "./supabase";
import { type TenantBillingSettings, loadTenantBillingSettings } from "./tenantBillingSettings";
import { isNcfTypeActive, normalizeNcfTypeForFiscalMode } from "./ncf";

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

  const isConfigComplete = Boolean(
    settings.rnc?.trim() &&
    settings.nombre?.trim() &&
    settings.direccion?.trim() &&
    settings.ecfIssuerSucursal?.trim() &&
    settings.ecfIssuerMunicipio?.trim() &&
    settings.ecfIssuerProvincia?.trim() &&
    settings.ecfIssuerActividadEconomica?.trim() &&
    settings.ecfIssuerCorreoEmisor?.trim()
  );

  if (isOnline) {
    if (!isConfigComplete) {
      const fallbackMode = settings.fiscalModeFallback || "internal_receipt";
      return { mode: fallbackMode, certificateId: null };
    }

    try {
      const { data: cert } = await supabase
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

  // Honor the per-type "active" switch (tenants.ncf_tipos_activos). A comprobante
  // type the tenant turned off must NOT be emitted: the sale falls back to a
  // non-fiscal receipt (no NCF) instead of stamping the disabled type. This is the
  // single choke point for every checkout (takeout + mesa) and both engines —
  // loadTenantBillingSettings reads the local mirror when offline, so the rule
  // holds online and local. Fail closed when configuration is unavailable.
  const settings = await loadTenantBillingSettings(args.tenantId);
  if (!settings) {
    throw new Error("No se pudo validar la configuración de tipos NCF.");
  }
  const activeMap = settings?.ncfTiposActivos;

  if (args.activeMode === "ncf_legacy") {
    const effectiveType =
      args.preferredNcfType?.trim().toUpperCase() || settings?.defaultNcfType || "B02";
    if (!isNcfTypeActive(activeMap, effectiveType)) {
      return null;
    }

    const ncfPart = await resolveNcfForNewInvoiceLocalFirst(args.tenantId, effectiveType);
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
    let typeCode: string;
    let ecfType: string;
    if (args.preferredNcfType && args.preferredNcfType.trim() !== "") {
      typeCode = normalizeNcfTypeForFiscalMode(args.preferredNcfType as any, "dgii_ecf");
      ecfType = typeCode.startsWith("E") ? typeCode.slice(1) : typeCode;
    } else {
      const clientRncTrimmed = args.clientRnc?.trim() || "";
      ecfType = clientRncTrimmed !== "" ? "31" : "32";
      typeCode = `E${ecfType}`;
    }

    if (!isNcfTypeActive(activeMap, typeCode)) {
      return null;
    }

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
  const writes = await buildEcfDocumentWrites(args);
  for (const write of writes) await enqueueLocalWrite(write);
  return { ecfDocumentId: args.ecfDocumentId ?? String(writes[0].rowId) };
}

/** Builds e-CF records so a checkout can commit them with its invoice atomically. */
export async function buildEcfDocumentWrites(args: {
  tenantId: string;
  facturaId: string;
  certificateId: string | null;
  ecfType: string;
  deviceId: string;
  ecfDocumentId?: string;
}): Promise<LocalFirstWrite[]> {
  const ecfDocumentId = args.ecfDocumentId || crypto.randomUUID();
  const now = new Date().toISOString();

  const settings = await loadTenantBillingSettings(args.tenantId);
  const isConfigComplete = Boolean(
    settings &&
    settings.rnc?.trim() &&
    settings.nombre?.trim() &&
    settings.direccion?.trim() &&
    settings.ecfIssuerSucursal?.trim() &&
    settings.ecfIssuerMunicipio?.trim() &&
    settings.ecfIssuerProvincia?.trim() &&
    settings.ecfIssuerActividadEconomica?.trim() &&
    settings.ecfIssuerCorreoEmisor?.trim() &&
    args.certificateId
  );

  const documentStatus = isConfigComplete ? "pending_offline" : "pending_configuration";
  const jobStatus = isConfigComplete ? "pending_sync" : "blocked_configuration";

  const documentWrite: LocalFirstWrite = {
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
      status: documentStatus,
      created_at: now,
      updated_at: now,
    },
    deviceId: args.deviceId,
  };

  const jobId = crypto.randomUUID();
  const outboxWrite: LocalFirstWrite = {
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
      status: jobStatus,
      attempts: 0,
      next_attempt_at: now,
      idempotency_key: `${args.tenantId}:${args.facturaId}:submit`,
      created_at: now,
      updated_at: now,
    },
    deviceId: args.deviceId,
  };

  return [documentWrite, outboxWrite];
}
