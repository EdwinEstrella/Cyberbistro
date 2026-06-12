import { PostgresFiscalWorkerRepository, createProjectAdminPgPoolFromEnv } from "./postgresFiscalWorkerRepository";
import { RealDgiiClient, RealXmlSigner } from "./dgiiAdapters";
import { fiscalWorkerError } from "./errors";
// import { convertECF32ToRFCE } from "dgii-ecf";

export class RfceBatchWorker {
  private db: any;

  constructor() {
    this.db = createProjectAdminPgPoolFromEnv();
  }

  async runBatchProcess() {
    console.log("[RfceBatchWorker] Starting RFCE daily batch process...");

    // 1. Find all tenants that have pending_rfce_batch documents
    const tenantsResult = await this.db.query(`
      SELECT DISTINCT tenant_id 
      FROM public.ecf_documents 
      WHERE status = 'pending_rfce_batch'
    `);

    for (const row of tenantsResult.rows) {
      const tenantId = row.tenant_id;
      await this.processTenant(tenantId);
    }

    console.log("[RfceBatchWorker] RFCE daily batch process completed.");
  }

  private async processTenant(tenantId: string) {
    // 2. Fetch pending documents for this tenant
    const docsResult = await this.db.query(`
      SELECT ed.id, ed.factura_id, ed.certificate_metadata_id, cm.environment, f.created_at as fiscal_date
      FROM public.ecf_documents ed
      JOIN public.ecf_certificate_metadata cm ON ed.certificate_metadata_id = cm.id
      JOIN public.facturas f ON ed.factura_id = f.id
      WHERE ed.tenant_id = $1 AND ed.status = 'pending_rfce_batch'
    `, [tenantId]);

    if (docsResult.rows.length === 0) return;

    // 3. Group by environment and fiscal date
    const groups: Record<string, any[]> = {};
    for (const doc of docsResult.rows) {
      const dateStr = new Date(doc.fiscal_date).toISOString().substring(0, 10);
      const key = `${doc.environment}|${dateStr}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }

    for (const [key, docs] of Object.entries(groups)) {
      const [environment, fiscalDate] = key.split("|");
      await this.createAndSubmitBatch(tenantId, environment, fiscalDate, docs);
    }
  }

  private async createAndSubmitBatch(tenantId: string, environment: string, fiscalDate: string, docs: any[]) {
    try {
      // 4. Create batch record
      const batchResult = await this.db.query(`
        INSERT INTO public.ecf_batches (tenant_id, environment, fiscal_date, status)
        VALUES ($1, $2, $3, 'draft')
        RETURNING id
      `, [tenantId, environment, fiscalDate]);
      
      const batchId = batchResult.rows[0].id;

      // 5. Associate documents to batch
      const docIds = docs.map((d) => d.id);
      await this.db.query(`
        UPDATE public.ecf_documents 
        SET ecf_batch_id = $1 
        WHERE id = ANY($2)
      `, [batchId, docIds]);

      // TODO: Build the actual batch XML payload according to DGII standard
      // const batchXml = buildRfceBatch(docs);
      
      // TODO: Sign the XML
      // const signer = new RealXmlSigner();
      // const signedXml = await signer.signXml(...);

      // TODO: Send using DGII Client
      // const dgii = new RealDgiiClient();
      // const result = await dgii.sendSummary({ ... });

      /*
      if (result.kind === "submitted") {
        await this.db.query(`UPDATE public.ecf_batches SET status = 'submitted', track_id = $1 WHERE id = $2`, [result.trackId, batchId]);
      } else {
        await this.db.query(`UPDATE public.ecf_batches SET status = 'rejected', last_error = $1 WHERE id = $2`, [result.message, batchId]);
        await this.db.query(`UPDATE public.ecf_documents SET status = 'rejected', rejection_scope = 'batch', last_error = $1 WHERE ecf_batch_id = $2`, [result.message, batchId]);
      }
      */

      console.log(`[RfceBatchWorker] Created batch ${batchId} for tenant ${tenantId} (${fiscalDate}).`);

    } catch (err: any) {
      console.error(`[RfceBatchWorker] Error processing batch for tenant ${tenantId}:`, err);
    }
  }
}

// Optional execution wrapper
if (require.main === module) {
  new RfceBatchWorker().runBatchProcess().catch(console.error);
}
