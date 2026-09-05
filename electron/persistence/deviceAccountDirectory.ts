import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export interface SavedAccountMetadata {
  id: string;
  email: string;
  hasPassword: boolean;
}

export interface DeviceSessionPreference {
  tenantId: string;
  userId: string;
  allowedBranchIds: string[];
  defaultBranchId: string | null;
}

export class DeviceAccountDirectory {
  private constructor(private readonly database: DatabaseSync) {}

  static open(dataRoot: string): DeviceAccountDirectory {
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    const databasePath = join(dataRoot, "device-directory.sqlite");
    const database = new DatabaseSync(databasePath, { defensive: true, enableForeignKeyConstraints: true });
    chmodSync(databasePath, 0o600);
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS saved_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_ciphertext BLOB,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
      CREATE TABLE IF NOT EXISTS device_session_preferences (
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        allowed_branch_ids_json TEXT NOT NULL,
        default_branch_id TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, user_id)
      ) STRICT;
    `);
    return new DeviceAccountDirectory(database);
  }

  listAccounts(): SavedAccountMetadata[] {
    return (this.database.prepare("SELECT id, email, password_ciphertext IS NOT NULL AS has_password FROM saved_accounts ORDER BY updated_at DESC, email ASC").all() as Array<{ id: string; email: string; has_password: number }>)
      .map((row) => ({ id: row.id, email: row.email, hasPassword: row.has_password === 1 }));
  }

  saveAccount(input: { email: string; passwordCiphertext: Uint8Array | null }): SavedAccountMetadata {
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("Invalid saved account email");
    const existing = this.database.prepare("SELECT id FROM saved_accounts WHERE email = ?").get(email) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    this.database.prepare(`
      INSERT INTO saved_accounts (id, email, password_ciphertext, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET password_ciphertext = excluded.password_ciphertext, updated_at = CURRENT_TIMESTAMP
    `).run(id, email, input.passwordCiphertext ?? null);
    return { id, email, hasPassword: input.passwordCiphertext !== null };
  }

  getPasswordCiphertext(id: string): Uint8Array | null {
    const row = this.database.prepare("SELECT password_ciphertext FROM saved_accounts WHERE id = ?").get(id) as { password_ciphertext: Uint8Array | null } | undefined;
    return row?.password_ciphertext ?? null;
  }

  deleteAccount(id: string): void {
    this.database.prepare("DELETE FROM saved_accounts WHERE id = ?").run(id);
  }

  saveSessionPreference(input: DeviceSessionPreference): DeviceSessionPreference {
    const allowedBranchIds = normalizeBranchIds(input.allowedBranchIds);
    const defaultBranchId = input.defaultBranchId && allowedBranchIds.includes(input.defaultBranchId)
      ? input.defaultBranchId
      : allowedBranchIds[0] ?? null;
    this.database.prepare(`
      INSERT INTO device_session_preferences (tenant_id, user_id, allowed_branch_ids_json, default_branch_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        allowed_branch_ids_json = excluded.allowed_branch_ids_json,
        default_branch_id = excluded.default_branch_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(input.tenantId, input.userId, JSON.stringify(allowedBranchIds), defaultBranchId);
    return { ...input, allowedBranchIds, defaultBranchId };
  }

  readSessionPreference(tenantId: string, userId: string): DeviceSessionPreference | null {
    const row = this.database.prepare("SELECT allowed_branch_ids_json, default_branch_id FROM device_session_preferences WHERE tenant_id = ? AND user_id = ?").get(tenantId, userId) as { allowed_branch_ids_json: string; default_branch_id: string | null } | undefined;
    if (!row) return null;
    let allowedBranchIds: string[];
    try { allowedBranchIds = normalizeBranchIds(JSON.parse(row.allowed_branch_ids_json)); } catch { return null; }
    const defaultBranchId = row.default_branch_id && allowedBranchIds.includes(row.default_branch_id) ? row.default_branch_id : allowedBranchIds[0] ?? null;
    return { tenantId, userId, allowedBranchIds, defaultBranchId };
  }

  close(): void { this.database.close(); }
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= 320 && email.includes("@") ? email : "";
}

function normalizeBranchIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(id)))];
}
