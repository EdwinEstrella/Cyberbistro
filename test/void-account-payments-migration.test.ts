import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261014120000_allow_void_account_payments.sql"),
  "utf8"
);

describe("void account payments migration", () => {
  it("replaces the blanket delete block with an admin and accounting policy on both payment tables", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS cb_cxp_pagos_no_app_delete ON public.cxp_pagos");
    expect(migration).toContain("DROP POLICY IF EXISTS cb_cxc_pagos_no_app_delete ON public.cxc_pagos");
    expect(migration).toContain("CREATE POLICY cb_cxp_pagos_admin_accounting_delete ON public.cxp_pagos");
    expect(migration).toContain("CREATE POLICY cb_cxc_pagos_admin_accounting_delete ON public.cxc_pagos");
    expect(migration.match(/FOR DELETE/g)).toHaveLength(2);
    expect(migration.match(/ARRAY\['admin', 'contabilidad'\]/g)).toHaveLength(2);
  });

  it("is idempotent and leaves the restrictive branch grant policy alone", () => {
    expect(migration.match(/CREATE POLICY/g)?.length).toBe(migration.match(/DROP POLICY IF EXISTS cb_\w+_admin_accounting_delete/g)?.length);
    expect(migration).not.toMatch(/(CREATE|DROP|ALTER) POLICY[^;]*cloudix_branch_grant_required/);
  });
});
