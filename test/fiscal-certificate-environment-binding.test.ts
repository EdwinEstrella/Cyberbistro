import { describe, expect, it } from "vitest";
import { CLAIM_JOB_SQL } from "../worker/fiscal/postgresFiscalWorkerRepository";
import { RFCE_PENDING_DOCUMENTS_SQL } from "../worker/fiscal/rfceBatchWorker";

const normalize = (sql: string) => sql.replace(/\s+/g, " ");

describe("certificate bound to the tenant environment", () => {
  it("claim query only considers certificates of the tenant ecf_environment", () => {
    const lateral = normalize(CLAIM_JOB_SQL).split("LEFT JOIN LATERAL")[1]?.split(") cm ON true")[0] ?? "";
    expect(lateral).toContain("cm.environment = t.ecf_environment");
    expect(lateral).toContain("cm.is_ready IS TRUE");
  });

  it("keeps the pinned certificate filter alongside the environment filter", () => {
    const lateral = normalize(CLAIM_JOB_SQL).split("LEFT JOIN LATERAL")[1]?.split(") cm ON true")[0] ?? "";
    expect(lateral).toContain("(ed.certificate_metadata_id IS NULL OR cm.id = ed.certificate_metadata_id)");
    expect(lateral).toContain("cm.environment = t.ecf_environment");
  });

  it("RFCE batch query joins tenants and filters by the tenant environment", () => {
    const sql = normalize(RFCE_PENDING_DOCUMENTS_SQL);
    expect(sql).toContain("JOIN public.tenants t ON t.id = ed.tenant_id");
    expect(sql).toContain("cm.environment = t.ecf_environment");
  });
});
