import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "migrations", "20260808120000_allow-admin-purchase-cancellation.sql"),
  "utf8"
);

describe("purchase cancellation migration", () => {
  it("allows only administrators to remove every record created by a purchase", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS cb_compras_no_app_delete");
    expect(migration).toContain("CREATE POLICY cb_compras_admin_delete ON public.compras");
    expect(migration).toContain("CREATE POLICY cb_compra_detalles_admin_delete ON public.compra_detalles");
    expect(migration).toContain("CREATE POLICY cb_inventario_movimientos_admin_delete ON public.inventario_movimientos");
    expect(migration).toContain("CREATE POLICY cb_compra_fiscal_admin_delete ON public.compra_fiscal");
    expect(migration).toContain("ARRAY['admin']");
  });
});
