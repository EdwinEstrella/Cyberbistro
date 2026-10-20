// Supabase-backed ReceptorStore. Uses the service role only; every query is scoped by tenant_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  ReceivedApprovalRow,
  ReceivedDocumentRow,
  ReceptorStore,
  StoredCertificate,
} from "./handler.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function fail(operation: string): never {
  throw new Error(`Store operation failed: ${operation}`);
}

export function createSupabaseStore(supabaseUrl: string, serviceRoleKey: string): ReceptorStore {
  const db: Db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async resolveTenant(rnc) {
      const { data, error } = await db.rpc("ecf_receptor_resolve_tenant", { p_rnc: rnc });
      if (error) fail("resolveTenant");
      const row = Array.isArray(data) ? data[0] : data;
      return typeof row?.tenant_id === "string" ? row.tenant_id : null;
    },

    async consumeSeed(tenantId, hash, expiresAt, now) {
      // Insert-as-consumed: the unique seed_hash makes a second use fail atomically.
      const { error } = await db.from("ecf_receptor_seeds").insert({
        tenant_id: tenantId,
        seed_hash: hash,
        expires_at: expiresAt.toISOString(),
        consumed_at: now.toISOString(),
      });
      if (error?.code === "23505") return false;
      if (error) fail("consumeSeed");
      return true;
    },

    async createToken(tenantId, hash, expiresAt, subjectIds) {
      const { error } = await db.from("ecf_receptor_tokens").insert({
        tenant_id: tenantId,
        token_hash: hash,
        expires_at: expiresAt.toISOString(),
        subject_rnc: subjectIds.join(","),
      });
      if (error) fail("createToken");
    },

    async findToken(hash, now) {
      const { data, error } = await db
        .from("ecf_receptor_tokens")
        .select("tenant_id, subject_rnc")
        .eq("token_hash", hash)
        .gt("expires_at", now.toISOString())
        .maybeSingle();
      if (error) fail("findToken");
      if (typeof data?.tenant_id !== "string") return null;
      const subjectIds = typeof data.subject_rnc === "string" ? data.subject_rnc.split(",").filter(Boolean) : [];
      return { tenantId: data.tenant_id, subjectIds };
    },

    async hasAcceptedDocument(tenantId, emisorRnc, encf) {
      const { data, error } = await db
        .from("ecf_received_documents")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("emisor_rnc", emisorRnc)
        .eq("encf", encf)
        .eq("estado", 0)
        .limit(1);
      if (error) fail("hasAcceptedDocument");
      return Array.isArray(data) && data.length > 0;
    },

    async insertDocument(row: ReceivedDocumentRow) {
      const { error } = await db.from("ecf_received_documents").insert({
        tenant_id: row.tenantId,
        emisor_rnc: row.emisorRnc,
        comprador_rnc: row.compradorRnc,
        encf: row.encf,
        tipo_ecf: row.tipoEcf,
        estado: row.estado,
        motivo_no_recibido: row.motivoNoRecibido,
        xml: row.xml,
        xml_sha256: row.xmlSha256,
        arecf_xml: row.arecfXml,
        signer_ids: row.signerIds.join(",") || null,
        signer_serial: row.signerSerial,
        signer_rnc_mismatch: row.signerRncMismatch,
      });
      if (error?.code === "23505") return "duplicate";
      if (error) fail("insertDocument");
      return "inserted";
    },

    async upsertApproval(row: ReceivedApprovalRow) {
      const { error } = await db.from("ecf_received_approvals").upsert(
        {
          tenant_id: row.tenantId,
          emisor_rnc: row.emisorRnc,
          comprador_rnc: row.compradorRnc,
          encf: row.encf,
          estado: row.estado,
          detalle_motivo_rechazo: row.detalleMotivoRechazo,
          xml: row.xml,
          signer_ids: row.signerIds.join(",") || null,
          signer_serial: row.signerSerial,
          signer_rnc_mismatch: row.signerRncMismatch,
          received_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,emisor_rnc,encf,comprador_rnc" },
      );
      if (error) fail("upsertApproval");
    },

    async allowsCertificationSigners(tenantId) {
      // Fail closed: a lookup error or unknown environment never enables the pinned test signers.
      const { data, error } = await db.from("tenants").select("ecf_environment").eq("id", tenantId).maybeSingle();
      if (error) return false;
      return data?.ecf_environment === "test" || data?.ecf_environment === "certification";
    },

    async loadCertificate(tenantId): Promise<StoredCertificate | null> {
      const { data: tenant } = await db.from("tenants").select("ecf_environment").eq("id", tenantId).maybeSingle();
      const { data, error } = await db
        .from("ecf_certificate_metadata")
        .select("environment, storage_ref, password_encrypted")
        .eq("tenant_id", tenantId)
        .eq("is_ready", true);
      if (error) fail("loadCertificate");
      const rows = (Array.isArray(data) ? data : []).filter(
        (row: { storage_ref?: unknown; password_encrypted?: unknown }) =>
          typeof row.storage_ref === "string" &&
          row.storage_ref.startsWith(`${tenantId}/`) &&
          typeof row.password_encrypted === "string",
      );
      const preferred = rows.find((row: { environment: string }) => row.environment === tenant?.ecf_environment) ?? rows[0];
      if (!preferred) return null;
      const { data: file, error: downloadError } = await db.storage.from("fiscal_certificates").download(preferred.storage_ref);
      if (downloadError || !file) fail("downloadCertificate");
      return { p12Bytes: new Uint8Array(await file.arrayBuffer()), passphraseEncrypted: preferred.password_encrypted };
    },
  };
}
