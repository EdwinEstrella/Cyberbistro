import { describe, expect, it } from "vitest";
import { CLAIM_JOB_SQL } from "../worker/fiscal/postgresFiscalWorkerRepository";
import { RFCE_BATCH_ASSOCIATE_DOCUMENTS_SQL, RFCE_PENDING_DOCUMENTS_SQL } from "../worker/fiscal/rfceBatchWorker";

const normalize = (sql: string) => sql.replace(/\s+/g, " ");

describe("certificate bound to the tenant environment", () => {
  it("claim query only considers certificates of the tenant ecf_environment", () => {
    const lateral = normalize(CLAIM_JOB_SQL).split("LEFT JOIN LATERAL")[1]?.split(") cm ON true")[0] ?? "";
    expect(lateral).toContain("cm.environment = t.ecf_environment");
    expect(lateral).toContain("cm.is_ready IS TRUE");
  });

  it("prefers pinned certificate when ready in the environment, otherwise falls back to current environment cert", () => {
    const lateral = normalize(CLAIM_JOB_SQL).split("LEFT JOIN LATERAL")[1]?.split(") cm ON true")[0] ?? "";
    expect(lateral).toContain("(cm.id = ed.certificate_metadata_id) DESC NULLS LAST");
    expect(lateral).toContain("cm.environment = t.ecf_environment");
    expect(lateral).not.toContain("ed.certificate_metadata_id IS NULL OR cm.id = ed.certificate_metadata_id");
  });

  it("RFCE batch query joins tenants and filters by the tenant environment using lateral preference", () => {
    const sql = normalize(RFCE_PENDING_DOCUMENTS_SQL);
    expect(sql).toContain("JOIN public.tenants t ON t.id = ed.tenant_id");
    expect(sql).toContain("cm.environment = t.ecf_environment");
    expect(sql).toContain("(cm.id = ed.certificate_metadata_id) DESC NULLS LAST");
  });

  it("RFCE batch associate query updates documents in a single unnest statement with uuid casts", () => {
    const sql = normalize(RFCE_BATCH_ASSOCIATE_DOCUMENTS_SQL);
    expect(sql).toContain("UPDATE public.ecf_documents ed");
    expect(sql).toContain("SET ecf_batch_id = $1, certificate_metadata_id = v.cert_id");
    expect(sql).toContain("FROM unnest($2::uuid[], $3::uuid[]) AS v(doc_id, cert_id)");
    expect(sql).toContain("WHERE ed.id = v.doc_id");
  });
});
