import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261119190000_tenant_delete_no_action_fks.sql",
);

const sql = readFileSync(migrationPath, "utf8");

interface ExpectedConstraint {
  table: string;
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

const EXPECTED_CONSTRAINTS: ExpectedConstraint[] = [
  {
    table: "public.compras",
    name: "compras_cycle_id_fkey",
    column: "cycle_id",
    referencedTable: "public.cierres_operativos",
    referencedColumn: "id",
  },
  {
    table: "public.consumos",
    name: "consumos_plato_id_fkey",
    column: "plato_id",
    referencedTable: "public.platos",
    referencedColumn: "id",
  },
  {
    table: "public.cuentas_pagar",
    name: "cuentas_pagar_cycle_id_fkey",
    column: "cycle_id",
    referencedTable: "public.cierres_operativos",
    referencedColumn: "id",
  },
  {
    table: "public.ecf_documents",
    name: "ecf_documents_factura_id_fkey",
    column: "factura_id",
    referencedTable: "public.facturas",
    referencedColumn: "id",
  },
  {
    table: "public.facturas",
    name: "facturas_credit_note_of_fkey",
    column: "credit_note_of",
    referencedTable: "public.facturas",
    referencedColumn: "id",
  },
  {
    table: "public.fiscal_outbox",
    name: "fiscal_outbox_factura_id_fkey",
    column: "factura_id",
    referencedTable: "public.facturas",
    referencedColumn: "id",
  },
  {
    table: "public.menu_links",
    name: "menu_links_sucursal_id_fkey",
    column: "sucursal_id",
    referencedTable: "public.sucursales",
    referencedColumn: "id",
  },
  {
    table: "public.menu_links",
    name: "menu_links_menu_id_fkey",
    column: "menu_id",
    referencedTable: "public.menus",
    referencedColumn: "id",
  },
  {
    table: "public.menu_links",
    name: "menu_links_customer_id_fkey",
    column: "customer_id",
    referencedTable: "public.customers",
    referencedColumn: "id",
  },
];

describe("tenant delete NO ACTION foreign keys migration", () => {
  it("covers all 9 child-to-child foreign keys", () => {
    expect(EXPECTED_CONSTRAINTS).toHaveLength(9);
  });

  it.each(EXPECTED_CONSTRAINTS)(
    "drops and re-adds $name with ON DELETE NO ACTION and NOT VALID",
    ({ table, name, column, referencedTable, referencedColumn }) => {
      const dropPattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(".", "\\.")}\\s+DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${name};`,
        "i",
      );
      expect(sql).toMatch(dropPattern);

      const addPattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(".", "\\.")}\\s+ADD\\s+CONSTRAINT\\s+${name}\\s+FOREIGN\\s+KEY\\s*\\(${column}\\)\\s+REFERENCES\\s+${referencedTable.replace(".", "\\.")}\\s*\\(${referencedColumn}\\)\\s+ON\\s+DELETE\\s+NO\\s+ACTION\\s+NOT\\s+VALID;`,
        "i",
      );
      expect(sql).toMatch(addPattern);

      const validatePattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(".", "\\.")}\\s+VALIDATE\\s+CONSTRAINT\\s+${name};`,
        "i",
      );
      expect(sql).toMatch(validatePattern);
    },
  );

  it("contains no ON DELETE RESTRICT in the migration", () => {
    expect(sql).not.toMatch(/ON\s+DELETE\s+RESTRICT/i);
  });

  it("does not add CASCADE to any of these child constraints", () => {
    for (const { name } of EXPECTED_CONSTRAINTS) {
      const cascadePattern = new RegExp(
        `ADD\\s+CONSTRAINT\\s+${name}[\\s\\S]*?ON\\s+DELETE\\s+CASCADE`,
        "i",
      );
      expect(sql).not.toMatch(cascadePattern);
    }
  });

  it("validates every re-added constraint to avoid leaving invalid constraints", () => {
    for (const { name } of EXPECTED_CONSTRAINTS) {
      expect(sql).toContain(`VALIDATE CONSTRAINT ${name};`);
    }
  });

  it("notifies PostgREST to reload the schema cache", () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
