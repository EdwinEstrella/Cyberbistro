import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { buildEcfDocumentPayloadForServer } from "../../src/shared/lib/fiscalSyncPayload";

export interface UnpushedFiscalRows {
  unqueuedEcfDocs: Array<Record<string, unknown>>;
  unqueuedFiscalOutbox: Array<Record<string, unknown>>;
  facturasToPush: Array<Record<string, unknown>>;
}

export interface BackfillSummary {
  facturasEnqueued: number;
  ecfDocumentsEnqueued: number;
  fiscalOutboxEnqueued: number;
}

export function selectUnpushedRows(db: DatabaseSync, tenantId: string): UnpushedFiscalRows {
  const unqueuedEcfDocs = db.prepare(`
    SELECT * FROM ecf_documents
    WHERE tenant_id = ?
      AND status = 'pending_offline'
      AND id NOT IN (SELECT row_id FROM sync_outbox WHERE tenant_id = ? AND table_name = 'ecf_documents')
    ORDER BY rowid ASC
  `).all(tenantId, tenantId) as Array<Record<string, unknown>>;

  const unqueuedFiscalOutbox = db.prepare(`
    SELECT * FROM fiscal_outbox
    WHERE tenant_id = ?
      AND status = 'pending_sync'
      AND id NOT IN (SELECT row_id FROM sync_outbox WHERE tenant_id = ? AND table_name = 'fiscal_outbox')
    ORDER BY rowid ASC
  `).all(tenantId, tenantId) as Array<Record<string, unknown>>;

  const facturaIds = new Set<string>();
  for (const doc of unqueuedEcfDocs) {
    if (doc.factura_id) facturaIds.add(String(doc.factura_id));
  }
  for (const outbox of unqueuedFiscalOutbox) {
    if (outbox.factura_id) facturaIds.add(String(outbox.factura_id));
  }

  const facturasToPush: Array<Record<string, unknown>> = [];
  if (facturaIds.size > 0) {
    const placeholders = Array.from(facturaIds).map(() => "?").join(", ");
    const facturas = db.prepare(`
      SELECT * FROM facturas
      WHERE tenant_id = ?
        AND id IN (${placeholders})
        AND id NOT IN (SELECT row_id FROM sync_outbox WHERE tenant_id = ? AND table_name = 'facturas')
      ORDER BY rowid ASC
    `).all(tenantId, ...Array.from(facturaIds), tenantId) as Array<Record<string, unknown>>;
    facturasToPush.push(...facturas);
  }

  return { unqueuedEcfDocs, unqueuedFiscalOutbox, facturasToPush };
}

export function findEcfDocForFactura(
  db: DatabaseSync,
  tenantId: string,
  facturaId: string
): { id: string; status: string } | undefined {
  return db.prepare(`
    SELECT id, status FROM ecf_documents
    WHERE tenant_id = ? AND factura_id = ?
    LIMIT 1
  `).get(tenantId, facturaId) as { id: string; status: string } | undefined;
}

export function repairFacturaFiscalMode(
  db: DatabaseSync,
  tenantId: string,
  facturaId: string,
  currentFiscalMode: unknown
): void {
  if (currentFiscalMode !== "dgii_ecf") {
    db.prepare(`
      UPDATE facturas SET fiscal_mode = 'dgii_ecf'
      WHERE tenant_id = ? AND id = ? AND fiscal_mode <> 'dgii_ecf'
    `).run(tenantId, facturaId);
  }
}

export function buildFacturaPayload(
  factura: Record<string, unknown>,
  ecfDoc?: { id: string; status: string }
): Record<string, unknown> {
  let items = factura.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }

  const payload: Record<string, unknown> = {
    ...factura,
    items: items ?? [],
  };

  if (ecfDoc) {
    const { payload: translatedDoc } = buildEcfDocumentPayloadForServer({ status: ecfDoc.status });
    payload.fiscal_mode = "dgii_ecf";
    payload.fiscal_document_id = ecfDoc.id;
    payload.fiscal_status = translatedDoc.status ?? "queued";
  }

  return payload;
}

export function buildEcfDocumentPayload(doc: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  return {
    id: doc.id,
    tenant_id: tenantId,
    factura_id: doc.factura_id,
    certificate_metadata_id: doc.certificate_metadata_id ?? null,
    ecf_type: doc.document_type,
    document_type: doc.document_type,
    status: doc.status,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

export function buildFiscalOutboxPayload(outbox: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  const op = outbox.operation ?? "submit";
  return {
    id: outbox.id,
    tenant_id: tenantId,
    ecf_document_id: outbox.ecf_document_id,
    factura_id: outbox.factura_id,
    operation: op,
    status: outbox.status,
    attempts: Number(outbox.attempts ?? 0),
    next_attempt_at: outbox.next_attempt_at,
    idempotency_key: outbox.idempotency_key ?? `${tenantId}:${outbox.factura_id}:${op}`,
    created_at: outbox.created_at,
    updated_at: outbox.updated_at,
  };
}

export function enqueueUnpushedFiscalRows(
  db: DatabaseSync,
  tenantId: string,
  unpushed: UnpushedFiscalRows
): BackfillSummary {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const insertStmt = db.prepare(`
      INSERT INTO sync_outbox (id, tenant_id, branch_id, table_name, row_id, operation, payload_json, status)
      VALUES (?, ?, ?, ?, ?, 'upsert', ?, 'pending')
    `);

    // 1. Re-push facturas FIRST with repaired fiscal_mode and fiscal metadata
    for (const factura of unpushed.facturasToPush) {
      const branchId = typeof factura.sucursal_id === "string" && factura.sucursal_id.trim()
        ? factura.sucursal_id
        : "main-process-default";
      const facturaId = String(factura.id);
      const ecfDoc = findEcfDocForFactura(db, tenantId, facturaId);

      if (ecfDoc) {
        repairFacturaFiscalMode(db, tenantId, facturaId, factura.fiscal_mode);
      }

      const payload = buildFacturaPayload(factura, ecfDoc);
      insertStmt.run(
        crypto.randomUUID(),
        tenantId,
        branchId,
        "facturas",
        facturaId,
        JSON.stringify(payload)
      );
    }

    // 2. Enqueue ecf_documents SECOND
    for (const doc of unpushed.unqueuedEcfDocs) {
      const branchId = typeof doc.sucursal_id === "string" && doc.sucursal_id.trim()
        ? doc.sucursal_id
        : "main-process-default";
      const payload = buildEcfDocumentPayload(doc, tenantId);
      insertStmt.run(
        crypto.randomUUID(),
        tenantId,
        branchId,
        "ecf_documents",
        String(doc.id),
        JSON.stringify(payload)
      );
    }

    // 3. Enqueue fiscal_outbox THIRD
    for (const outbox of unpushed.unqueuedFiscalOutbox) {
      const branchId = typeof outbox.sucursal_id === "string" && outbox.sucursal_id.trim()
        ? outbox.sucursal_id
        : "main-process-default";
      const payload = buildFiscalOutboxPayload(outbox, tenantId);
      insertStmt.run(
        crypto.randomUUID(),
        tenantId,
        branchId,
        "fiscal_outbox",
        String(outbox.id),
        JSON.stringify(payload)
      );
    }

    db.exec("COMMIT;");
    return {
      facturasEnqueued: unpushed.facturasToPush.length,
      ecfDocumentsEnqueued: unpushed.unqueuedEcfDocs.length,
      fiscalOutboxEnqueued: unpushed.unqueuedFiscalOutbox.length,
    };
  } catch (txErr) {
    db.exec("ROLLBACK;");
    throw txErr;
  }
}

export function backfillUnpushedFiscalRows(db: DatabaseSync, tenantId: string): BackfillSummary {
  try {
    const unpushed = selectUnpushedRows(db, tenantId);
    if (unpushed.unqueuedEcfDocs.length === 0 && unpushed.unqueuedFiscalOutbox.length === 0) {
      return { facturasEnqueued: 0, ecfDocumentsEnqueued: 0, fiscalOutboxEnqueued: 0 };
    }
    return enqueueUnpushedFiscalRows(db, tenantId, unpushed);
  } catch (err) {
    console.warn(`[fiscal-sync] backfillUnpushedFiscalRows failed for tenant ${tenantId}:`, err);
    return { facturasEnqueued: 0, ecfDocumentsEnqueued: 0, fiscalOutboxEnqueued: 0 };
  }
}
