import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initializeTenantSchema } from "../electron/persistence/schema";
import { applyCloudEcfDocumentRows } from "../electron/persistence/cloudApply";
import { PayrollSyncClient } from "../electron/persistence/payrollSyncClient";
import { buildFacturaReceiptHtml } from "../src/shared/lib/receiptTemplates";

const TENANT = "tenant-1";

describe("ecf_documents cloud->local pull mirror", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initializeTenantSchema(db, TENANT);
    db.prepare(`INSERT OR IGNORE INTO sucursales (id, tenant_id, name) VALUES ('branch-1', '${TENANT}', 'Principal')`).run();
  });

  afterEach(() => {
    db.close();
  });

  it("adds mirror columns additively to ecf_documents during schema initialization", () => {
    const cols = db.prepare("PRAGMA table_info(ecf_documents)").all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("dgii_status");
    expect(colNames).toContain("dgii_track_id");
    expect(colNames).toContain("dgii_status_message");
    expect(colNames).toContain("submitted_at");
    expect(colNames).toContain("accepted_at");
    expect(colNames).toContain("dgii_security_code");
  });

  it("applies mirror columns to existing local ecf_documents matched by id, preserving local status", () => {
    // 1. Setup local factura and ecf_documents
    db.prepare(`
      INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
      VALUES ('fac-1', '${TENANT}', 'branch-1', 'dgii_ecf', 1500, 'committed')
    `).run();

    db.prepare(`
      INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
      VALUES ('ecf-1', '${TENANT}', 'branch-1', 'fac-1', 'E32', 'queued')
    `).run();

    // 2. Cloud pull arrives with server outcome: status 'accepted', track_id, security code
    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "ecf-1",
        tenant_id: TENANT,
        factura_id: "fac-1",
        status: "accepted",
        dgii_track_id: "TRK-001",
        dgii_status_message: "Comprobante aceptado",
        dgii_security_code: "SEC789",
        submitted_at: "2026-11-06T10:00:00Z",
        accepted_at: "2026-11-06T10:05:00Z",
        updated_at: "2026-11-06T10:05:01Z",
      },
    ]);

    const row = db.prepare("SELECT * FROM ecf_documents WHERE id = 'ecf-1'").get() as any;
    // Local status remains 'queued' (never touched by DGII outcome)
    expect(row.status).toBe("queued");
    // Mirror columns are updated
    expect(row.dgii_status).toBe("accepted");
    expect(row.dgii_track_id).toBe("TRK-001");
    expect(row.dgii_status_message).toBe("Comprobante aceptado");
    expect(row.dgii_security_code).toBe("SEC789");
    expect(row.submitted_at).toBe("2026-11-06T10:00:00Z");
    expect(row.accepted_at).toBe("2026-11-06T10:05:00Z");
  });

  it("matches existing local ecf_documents by factura_id if cloud id differs", () => {
    db.prepare(`
      INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
      VALUES ('fac-2', '${TENANT}', 'branch-1', 'dgii_ecf', 2000, 'committed')
    `).run();

    db.prepare(`
      INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
      VALUES ('local-ecf-2', '${TENANT}', 'branch-1', 'fac-2', 'E31', 'pending_sync')
    `).run();

    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "server-ecf-2",
        tenant_id: TENANT,
        factura_id: "fac-2",
        status: "accepted",
        dgii_track_id: "TRK-002",
        dgii_security_code: "SEC321",
        submitted_at: "2026-11-06T11:00:00Z",
        accepted_at: "2026-11-06T11:02:00Z",
      },
    ]);

    const row = db.prepare("SELECT * FROM ecf_documents WHERE factura_id = 'fac-2'").get() as any;
    expect(row.id).toBe("local-ecf-2");
    expect(row.status).toBe("pending_sync");
    expect(row.dgii_status).toBe("accepted");
    expect(row.dgii_track_id).toBe("TRK-002");
    expect(row.dgii_security_code).toBe("SEC321");
  });

  it("never downgrades a local dgii_status once accepted or rejected", () => {
    db.prepare(`
      INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
      VALUES ('fac-3', '${TENANT}', 'branch-1', 'dgii_ecf', 1000, 'committed')
    `).run();

    db.prepare(`
      INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status, dgii_status, dgii_security_code)
      VALUES ('ecf-3', '${TENANT}', 'branch-1', 'fac-3', 'E32', 'queued', 'accepted', 'ORIGINAL_SEC')
    `).run();

    // Outdated or in-flight cloud poll arrives with older status 'submitted'
    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "ecf-3",
        tenant_id: TENANT,
        factura_id: "fac-3",
        status: "submitted",
        dgii_track_id: "TRK-OLD",
      },
    ]);

    const row = db.prepare("SELECT * FROM ecf_documents WHERE id = 'ecf-3'").get() as any;
    // Must remain accepted
    expect(row.dgii_status).toBe("accepted");
    expect(row.dgii_security_code).toBe("ORIGINAL_SEC");
  });

  it("does not insert server-only ecf_documents rows if the factura does not exist locally", () => {
    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "server-foreign-ecf",
        tenant_id: TENANT,
        factura_id: "fac-foreign-999",
        status: "accepted",
        dgii_track_id: "TRK-FOREIGN",
      },
    ]);

    const row = db.prepare("SELECT * FROM ecf_documents WHERE id = 'server-foreign-ecf'").get();
    expect(row).toBeUndefined();
  });

  it("inserts an ecf_documents row when the factura exists locally but ecf_documents does not yet", () => {
    db.prepare(`
      INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status)
      VALUES ('fac-4', '${TENANT}', 'branch-1', 'dgii_ecf', 3000, 'committed')
    `).run();

    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "ecf-4",
        tenant_id: TENANT,
        sucursal_id: "branch-1",
        factura_id: "fac-4",
        ecf_type: "E31",
        status: "accepted",
        dgii_track_id: "TRK-004",
        dgii_security_code: "SEC444",
        submitted_at: "2026-11-06T12:00:00Z",
        accepted_at: "2026-11-06T12:05:00Z",
      },
    ]);

    const row = db.prepare("SELECT * FROM ecf_documents WHERE id = 'ecf-4'").get() as any;
    expect(row).toBeDefined();
    expect(row.factura_id).toBe("fac-4");
    expect(row.status).toBe("queued"); // Local status is a valid client status
    expect(row.dgii_status).toBe("accepted");
    expect(row.dgii_security_code).toBe("SEC444");
    expect(row.dgii_track_id).toBe("TRK-004");
  });

  it("pulls ecf_documents with incremental updated_at cursor filter and maps server status to dgii_status", async () => {
    const capturedGteByTable: Record<string, { col: string; val: string }> = {};
    const client = {
      from: (table: string) => {
        let afterId: string | null = null;
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () => query,
          gt: (_col: string, val: string) => {
            afterId = val;
            return query;
          },
          gte: (col: string, val: string) => {
            capturedGteByTable[table] = { col, val };
            return query;
          },
          then: (resolve: (val: any) => void) => {
            if (table === "ecf_documents" && afterId == null) {
              resolve({
                data: [
                  {
                    id: "ecf-pull-1",
                    tenant_id: TENANT,
                    factura_id: "fac-pull-1",
                    status: "accepted",
                    dgii_track_id: "TRK-PULL-1",
                    dgii_security_code: "SECPULL1",
                    submitted_at: "2026-11-06T10:00:00Z",
                    accepted_at: "2026-11-06T10:05:00Z",
                    updated_at: "2026-11-06T10:05:00Z",
                  },
                ],
                error: null,
              });
            } else {
              resolve({ data: [], error: null });
            }
          },
        };
        return query;
      },
    };

    const syncClient = new PayrollSyncClient(client as any);
    const batch = await syncClient.pull({ tenantId: TENANT, cursor: "2026-11-06T09:00:00Z" });

    // Cursor filter was applied specifically to ecf_documents
    expect(capturedGteByTable.ecf_documents).toEqual({ col: "updated_at", val: "2026-11-06T09:00:00Z" });

    // The ecf_documents change is present and mapped
    const ecfChange = batch.changes.find((c) => c.tableName === "ecf_documents");
    expect(ecfChange).toBeDefined();
    expect(ecfChange?.payload).toEqual(
      expect.objectContaining({
        id: "ecf-pull-1",
        tenant_id: TENANT,
        factura_id: "fac-pull-1",
        dgii_status: "accepted",
        dgii_track_id: "TRK-PULL-1",
        dgii_security_code: "SECPULL1",
      })
    );
    // Crucially: server 'status' must NOT be in the mapped payload so local status is untouched
    expect(ecfChange?.payload.status).toBeUndefined();
  });

  it("renders pending receipt with menu QR first, then after pull applies accepted mirror columns, reprints with FC DGII QR and ACEPTADO state", async () => {
    // 1. Local checkout creates factura and pending ecf_document
    db.prepare(`
      INSERT INTO facturas (id, tenant_id, sucursal_id, fiscal_mode, total, local_status, ncf, ncf_tipo)
      VALUES ('fac-reprint-1', '${TENANT}', 'branch-1', 'dgii_ecf', 1500, 'committed', 'E320000000099', 'E32 - Consumo')
    `).run();

    db.prepare(`
      INSERT INTO ecf_documents (id, tenant_id, sucursal_id, factura_id, document_type, status)
      VALUES ('ecf-reprint-1', '${TENANT}', 'branch-1', 'fac-reprint-1', 'E32', 'pending_sync')
    `).run();

    const tenantInfo = {
      nombre_negocio: "CyberBistro",
      rnc: "130862346",
      direccion: "Santo Domingo",
      telefono: "809-555-0100",
      logo_url: null,
      ecf_environment: "certification" as const,
      moneda: "DOP",
      menu_url: "https://cyberbistro.app/menu",
    };

    const localDocBefore = db.prepare("SELECT * FROM ecf_documents WHERE id = 'ecf-reprint-1'").get() as any;

    // Prior to cloud pull: dgii_status is null, status is 'queued', security code is null
    const pendingHtml = await buildFacturaReceiptHtml(
      tenantInfo,
      {
        items: [{ cantidad: 1, nombre: "Plato", precio_unitario: 1500, subtotal: 1500 }],
        subtotal: 1500,
        itbis: 0,
        total: 1500,
        metodo_pago: "efectivo",
        mesa_numero: 1,
        notas: null,
        ncf: "E320000000099",
        ncf_tipo: "E32 - Consumo",
        ecf_status: localDocBefore.dgii_status ?? localDocBefore.status,
        ecf_track_id: localDocBefore.dgii_track_id,
        ecf_security_code: localDocBefore.dgii_security_code,
        ecf_submitted_at: localDocBefore.submitted_at ?? localDocBefore.accepted_at,
      },
      99,
      80
    );

    expect(pendingHtml).toContain("PENDIENTE DE ENVIO DGII");
    expect(pendingHtml).toContain("¡Escaneá para ver nuestro Menú!");
    expect(pendingHtml).not.toContain("Verificar comprobante");
    expect(pendingHtml).not.toContain("consultatimbrefc");

    // 2. Cloud pull arrives and applies mirror columns
    applyCloudEcfDocumentRows(db, TENANT, [
      {
        id: "ecf-reprint-1",
        tenant_id: TENANT,
        factura_id: "fac-reprint-1",
        status: "accepted",
        dgii_track_id: "TRK-ACCEPTED-99",
        dgii_security_code: "XYZ999",
        submitted_at: "2026-11-06T10:00:00Z",
        accepted_at: "2026-11-06T10:05:00Z",
      },
    ]);

    const localDocAfter = db.prepare("SELECT * FROM ecf_documents WHERE id = 'ecf-reprint-1'").get() as any;
    expect(localDocAfter.status).toBe("pending_sync"); // local CHECK column untouched
    expect(localDocAfter.dgii_status).toBe("accepted");

    // 3. Reprint receipt using mirrored fields (matching localInvoiceReceipt logic)
    const acceptedHtml = await buildFacturaReceiptHtml(
      tenantInfo,
      {
        items: [{ cantidad: 1, nombre: "Plato", precio_unitario: 1500, subtotal: 1500 }],
        subtotal: 1500,
        itbis: 0,
        total: 1500,
        metodo_pago: "efectivo",
        mesa_numero: 1,
        notas: null,
        ncf: "E320000000099",
        ncf_tipo: "E32 - Consumo",
        ecf_status: localDocAfter.dgii_status ?? localDocAfter.status,
        ecf_track_id: localDocAfter.dgii_track_id,
        ecf_security_code: localDocAfter.dgii_security_code,
        ecf_submitted_at: localDocAfter.submitted_at ?? localDocAfter.accepted_at,
      },
      99,
      80
    );

    expect(acceptedHtml).toContain("ACEPTADO POR DGII");
    expect(acceptedHtml).not.toContain("PENDIENTE DE ENVIO DGII");
    expect(acceptedHtml).not.toContain("¡Escaneá para ver nuestro Menú!");
    expect(acceptedHtml).toContain("Codigo de seguridad: XYZ999");
    expect(acceptedHtml).toContain("Track ID: TRK-ACCEPTED-99");
    expect(acceptedHtml).toContain("Verificar comprobante");
    expect(acceptedHtml).toContain("https://fc.dgii.gov.do/certecf/consultatimbrefc?rncemisor=130862346&encf=E320000000099&montototal=1500.00&codigoseguridad=XYZ999");
  });
});
