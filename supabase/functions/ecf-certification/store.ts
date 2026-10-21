// Supabase-backed CertificationStore. Service role only; every query is scoped by tenant_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CertificationStore } from "./context.ts";
import { SequenceConflictError, type Run, type RunType, type Submission, type SubmissionPatch } from "./run.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

function fail(operation: string): never {
  throw new Error(`Store operation failed: ${operation}`);
}

const RUN_COLUMNS = "id, tenant_id, environment, run_type, status, created_at";
const SUBMISSION_COLUMNS =
  "id, case_id, encf, tipo_ecf, kind, sequence_order, depends_on_case_id, status, track_id, dgii_messages, unsigned_xml, signed_xml, security_code, attempts, source_case_id";
const RUN_TYPES: RunType[] = ["test_set", "commercial_approval", "simulation"];
/** Kinds that carry an e-NCF issued by the tenant (an ACECF carries the DGII emitter's). */
const ISSUED_KINDS = ["ecf", "rfce", "portal_upload"];
const MAX_ISSUED_ROWS = 10_000;

// deno-lint-ignore no-explicit-any
function toRun(row: any): Run {
  return { id: row.id, tenantId: row.tenant_id, environment: row.environment, runType: RUN_TYPES.includes(row.run_type) ? row.run_type : "test_set", status: row.status, createdAt: row.created_at };
}

// deno-lint-ignore no-explicit-any
function toSubmission(row: any): Submission {
  return {
    id: row.id,
    caseId: row.case_id,
    encf: row.encf,
    tipoEcf: row.tipo_ecf,
    kind: row.kind,
    sequenceOrder: row.sequence_order,
    dependsOnCaseId: row.depends_on_case_id,
    status: row.status,
    trackId: row.track_id,
    messages: Array.isArray(row.dgii_messages) ? row.dgii_messages : [],
    unsignedXml: row.unsigned_xml,
    signedXml: row.signed_xml,
    securityCode: row.security_code,
    attempts: row.attempts,
    sourceCaseId: typeof row.source_case_id === "string" ? row.source_case_id : null,
  };
}

function toColumns(patch: SubmissionPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.trackId !== undefined) out.track_id = patch.trackId;
  if (patch.messages !== undefined) out.dgii_messages = patch.messages;
  if (patch.signedXml !== undefined) out.signed_xml = patch.signedXml;
  if (patch.signedSha256 !== undefined) out.signed_sha256 = patch.signedSha256;
  if (patch.securityCode !== undefined) out.security_code = patch.securityCode;
  if (patch.attempts !== undefined) out.attempts = patch.attempts;
  return out;
}

export function createSupabaseStore(opts: { url: string; publishableKey: string; serviceRoleKey: string }): CertificationStore {
  const db: Db = createClient(opts.url, opts.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async authenticate(token) {
      const authClient = createClient(opts.url, opts.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },

    async memberships(userId) {
      const { data, error } = await db.from("tenant_users").select("tenant_id, rol").eq("auth_user_id", userId).eq("activo", true);
      if (error) fail("memberships");
      return (Array.isArray(data) ? data : []).map((row: { tenant_id: string; rol: string }) => ({
        tenantId: row.tenant_id,
        rol: row.rol,
      }));
    },

    async tenantRnc(tenantId) {
      const { data, error } = await db.from("tenants").select("rnc").eq("id", tenantId).maybeSingle();
      if (error) fail("tenantRnc");
      return typeof data?.rnc === "string" ? data.rnc : null;
    },

    async tenantLegalName(tenantId) {
      const { data, error } = await db.from("tenants").select("nombre_negocio").eq("id", tenantId).maybeSingle();
      if (error) fail("tenantLegalName");
      return typeof data?.nombre_negocio === "string" ? data.nombre_negocio : null;
    },

    async tenantIssuerProfile(tenantId) {
      const { data, error } = await db
        .from("tenants")
        .select("rnc, nombre_negocio, direccion, ecf_issuer_sucursal, ecf_issuer_municipio, ecf_issuer_provincia, ecf_issuer_correo_emisor, ecf_issuer_actividad_economica")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) fail("tenantIssuerProfile");
      if (!data) return null;
      const text = (value: unknown) => (typeof value === "string" ? value : null);
      return {
        rnc: text(data.rnc),
        razonSocial: text(data.nombre_negocio),
        direccion: text(data.direccion),
        sucursal: text(data.ecf_issuer_sucursal),
        municipio: text(data.ecf_issuer_municipio),
        provincia: text(data.ecf_issuer_provincia),
        correoEmisor: text(data.ecf_issuer_correo_emisor),
        actividadEconomica: text(data.ecf_issuer_actividad_economica),
      };
    },

    async loadCertificate(tenantId, environment) {
      const { data, error } = await db
        .from("ecf_certificate_metadata")
        .select("storage_ref, password_encrypted")
        .eq("tenant_id", tenantId)
        .eq("environment", environment)
        .eq("is_ready", true)
        .maybeSingle();
      if (error) fail("loadCertificate");
      if (
        !data ||
        typeof data.storage_ref !== "string" ||
        !data.storage_ref.startsWith(`${tenantId}/`) ||
        typeof data.password_encrypted !== "string"
      ) {
        return null;
      }
      const { data: file, error: downloadError } = await db.storage.from("fiscal_certificates").download(data.storage_ref);
      if (downloadError || !file) fail("downloadCertificate");
      return { p12Bytes: new Uint8Array(await file.arrayBuffer()), passphraseEncrypted: data.password_encrypted };
    },

    async createRun(input) {
      const { data: run, error } = await db
        .from("ecf_certification_runs")
        .insert({
          tenant_id: input.tenantId,
          environment: input.environment,
          run_type: input.runType,
          source_sha256: input.sourceSha256,
          created_by: input.createdBy,
          status: "pending",
        })
        .select(RUN_COLUMNS)
        .single();
      if (error || !run) fail("createRun");
      const rows = input.submissions.map((sub) => ({
        run_id: run.id,
        tenant_id: input.tenantId,
        environment: input.environment,
        case_id: sub.caseId,
        encf: sub.encf,
        tipo_ecf: sub.tipoEcf,
        kind: sub.kind,
        sequence_order: sub.sequenceOrder,
        depends_on_case_id: sub.dependsOnCaseId,
        unsigned_xml: sub.unsignedXml,
        // run_type is set from the run by the insert trigger.
        ...(sub.sourceCaseId ? { source_case_id: sub.sourceCaseId } : {}),
      }));
      const { error: insertError } = await db.from("ecf_certification_submissions").insert(rows);
      if (insertError) {
        await db.from("ecf_certification_runs").delete().eq("id", run.id).eq("tenant_id", input.tenantId);
        // 23505: the unique / issued-e-NCF guard of the simulation migration.
        if (insertError.code === "23505") throw new SequenceConflictError();
        fail("createSubmissions");
      }
      return toRun(run);
    },

    async getRun(tenantId, runId) {
      const { data, error } = await db.from("ecf_certification_runs").select(RUN_COLUMNS).eq("id", runId).eq("tenant_id", tenantId).maybeSingle();
      if (error) fail("getRun");
      return data ? toRun(data) : null;
    },

    async latestRun(tenantId, environment, runType) {
      const { data, error } = await db
        .from("ecf_certification_runs")
        .select(RUN_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("environment", environment)
        .eq("run_type", runType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("latestRun");
      return data ? toRun(data) : null;
    },

    async issuedEncfs(tenantId, environment) {
      const { data, error } = await db
        .from("ecf_certification_submissions")
        .select("encf")
        .eq("tenant_id", tenantId)
        .eq("environment", environment)
        .in("kind", ISSUED_KINDS)
        .in("run_type", ["test_set", "simulation"])
        .order("encf", { ascending: false })
        .range(0, MAX_ISSUED_ROWS - 1);
      if (error) fail("issuedEncfs");
      const rows = Array.isArray(data) ? data : [];
      // Fail closed rather than allocate from a truncated history.
      if (rows.length >= MAX_ISSUED_ROWS) fail("issuedEncfs:truncated");
      return rows.map((row: { encf: string }) => row.encf);
    },

    async listSubmissions(runId) {
      const { data, error } = await db
        .from("ecf_certification_submissions")
        .select(SUBMISSION_COLUMNS)
        .eq("run_id", runId)
        .order("sequence_order", { ascending: true });
      if (error) fail("listSubmissions");
      return (Array.isArray(data) ? data : []).map(toSubmission);
    },

    async updateSubmission(id, patch, expected) {
      let query = db.from("ecf_certification_submissions").update(toColumns(patch)).eq("id", id);
      if (expected) query = query.eq("status", expected.status).eq("attempts", expected.attempts);
      const { data, error } = await query.select("id");
      if (error) fail("updateSubmission");
      return Array.isArray(data) && data.length > 0;
    },

    async setRunStatus(runId, status) {
      const { error } = await db.from("ecf_certification_runs").update({ status }).eq("id", runId);
      if (error) fail("setRunStatus");
    },
  };
}
