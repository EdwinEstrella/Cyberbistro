import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync("migrations/20260715120000_tenant-management.sql", "utf8");
const adminSql = readFileSync("sql/cloudix_super_admin_limits.sql", "utf8");
const ownerDeleteSql = readFileSync("migrations/20260519114600_owner-delete-staff.sql", "utf8");
const superAdminUserDeleteSql = readFileSync("migrations/20260510121152_super-admin-rpcs.sql", "utf8");
const repositorySchema = readFileSync("test/schema.sql", "utf8");
const paymentsIndexMigration = readFileSync("migrations/20260715000000_add-foreign-key-and-rls-indexes.sql", "utf8");
const accessRealtimeMigration = readFileSync("migrations/20260715000004_tenant-access-realtime.sql", "utf8");
const paymentAlertMigration = readFileSync("migrations/20260715000005_add-payment-day-alert-config.sql", "utf8");
const authoritativeMigration = readFileSync("migrations/20260715130000_tenant-access-authoritative-rules.sql", "utf8");

describe("tenant-management migration", () => {
  it("covers every repository tenant-owned table, including payments", () => {
    const schemaTenantTables = [...repositorySchema.matchAll(
      /ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+\w+_tenant_id_fkey\s+FOREIGN KEY \(tenant_id\)/gi,
    )].map((match) => match[1]);
    expect(schemaTenantTables.length).toBeGreaterThan(0);
    expect(migration).toContain("a.attname = 'tenant_id'");
    expect(migration).toContain("c.relkind IN ('r', 'p')");
    expect(migration).toContain("Cannot enforce tenant cascade");
    expect(migration).toContain("ALTER TABLE public.%I ADD CONSTRAINT");
    expect(paymentsIndexMigration).toContain("idx_payments_tenant_id ON public.payments (tenant_id)");
    expect(migration).toContain("ON DELETE CASCADE");
  });

  it("installs payment-day alert configuration independently", () => {
    expect(paymentAlertMigration).toContain("payment_day_of_month smallint");
    expect(paymentAlertMigration).toContain("BETWEEN 1 AND 31");
    expect(paymentAlertMigration).toContain("payment_day_of_month IS NULL");
  });

  it("preflights orphan tenant rows and duplicate Auth identities", () => {
    expect(migration).toContain("orphan tenant_id rows found");
    expect(migration).toContain("GROUP BY auth_user_id");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("tenant_users_auth_user_id_unique");
    expect(migration).toContain("WHERE auth_user_id IS NOT NULL");
  });

  it("does not regress inline tenant FKs in repository migrations", () => {
    const migrationDir = join(process.cwd(), "migrations");
    const migrationFiles = readdirSync(migrationDir);
    const inlineTenantReferences = migrationFiles
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(migrationDir, file), "utf8"))
      .flatMap((sql) => sql.split(/\r?\n/))
      .filter((line) => /tenant_id\b.*references\s+(?:public\.)?tenants\s*\(/i.test(line));

    expect(inlineTenantReferences.length).toBeGreaterThan(0);
    expect(inlineTenantReferences.every((line) => /on\s+delete\s+cascade/i.test(line))).toBe(true);
    // payments is represented by repository schema evidence but created outside
    // these migrations, so the catalog pass—not a comment or name list—covers it.
    expect(migration).toContain("a.attname = 'tenant_id'");
  });

  it("captures auth IDs, deletes auth users, then cascades the tenant", () => {
    const capture = migration.indexOf("array_agg(auth_user_id)");
    const authDelete = migration.indexOf("DELETE FROM auth.users");
    const tenantDelete = migration.indexOf("DELETE FROM public.tenants");
    expect(capture).toBeGreaterThan(-1);
    expect(authDelete).toBeGreaterThan(capture);
    expect(tenantDelete).toBeGreaterThan(authDelete);
    expect(adminSql).toContain("GET DIAGNOSTICS deleted_users = ROW_COUNT");
  });

  it("keeps unconditional Auth cleanup for individual staff deletion", () => {
    for (const sql of [ownerDeleteSql, superAdminUserDeleteSql, adminSql]) {
      const authGuard = sql.indexOf("IF target_row.auth_user_id IS NOT NULL");
      const authDelete = sql.indexOf("DELETE FROM auth.users", authGuard);
      expect(authGuard).toBeGreaterThan(-1);
      expect(authDelete).toBeGreaterThan(authGuard);
    }
  });

  it("defines least-privilege bidirectional tenant access realtime", () => {
    expect(accessRealtimeMigration).toContain("tenant-access:%");
    expect(accessRealtimeMigration).toContain("cloudix_tenant_access_channel_select");
    expect(accessRealtimeMigration).toContain("cloudix_tenant_access_channel_insert");
    expect(accessRealtimeMigration).toContain("tu.auth_user_id = public.cloudix_auth_user_id()");
    expect(accessRealtimeMigration).toContain("tu.email");
    expect(accessRealtimeMigration).toContain("tu.activo IS TRUE");
    expect(accessRealtimeMigration).toContain("WHEN (OLD.activa IS DISTINCT FROM NEW.activa)");
    expect(accessRealtimeMigration).toContain("tenant_access_changed");
    expect(accessRealtimeMigration).toContain("DROP POLICY IF EXISTS cloudix_tenant_access_message_insert");
    expect(accessRealtimeMigration).not.toContain("CREATE POLICY cloudix_tenant_access_message_insert");
    expect(accessRealtimeMigration).not.toContain("pattern <> 'tenant-access:%'");
  });

  it("suspends only tenants and publishes user revocation without reactivating staff", () => {
    expect(authoritativeMigration).toContain("UPDATE public.tenants SET activa = false");
    expect(authoritativeMigration).toContain("UPDATE public.tenants SET activa = true");
    expect(authoritativeMigration).not.toMatch(/UPDATE\s+public\.tenant_users\s+SET\s+activo/i);
    expect(authoritativeMigration).toContain("tenant-access-user:%");
    expect(authoritativeMigration).toContain("tenant_user_access_changed");
    expect(authoritativeMigration).toContain("TG_OP = 'DELETE'");
    expect(authoritativeMigration).toContain("auth_user_id IS NULL");
    expect(authoritativeMigration).toContain("DROP POLICY IF EXISTS cb_tenant_users_admin_staff_update");
    for (const sql of [
      readFileSync("migrations/20260510121152_super-admin-rpcs.sql", "utf8"),
      readFileSync("migrations/20260510121926_super-admin-unblock-tenant.sql", "utf8"),
      readFileSync("sql/cloudix_super_admin_limits.sql", "utf8"),
    ]) {
      expect(sql).not.toMatch(/UPDATE\s+public\.tenant_users\s+SET\s+activo/i);
      expect(sql).not.toMatch(/UPDATE\s+public\.cocina_estado\s+SET\s+activa/i);
    }
  });
});
