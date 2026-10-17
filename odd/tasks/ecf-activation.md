# Feature: e-CF activation (DGII electronic invoicing)

## Objective
A tenant can activate DGII electronic invoicing end to end from the activation wizard:
upload the .p12 to cloud custody, persist complete issuer data and e-NCF ranges, switch
`fiscal_mode` to `dgii_ecf`, and have the fiscal worker sign/submit without
`CERTIFICATE_NOT_FOUND`.

## Problem
- Certificate is stored only locally (Electron safeStorage) while `ecf_certificate_metadata`
  is marked `is_ready=true` with no `storage_ref` / `password_encrypted`; the worker fails
  terminally. Edge function `validate-ecf-certificate` (which writes those fields) is never
  invoked, and no migration defines those columns.
- `activateElectronicBilling()` in ActivationPanel validates and shows a message but never
  writes `fiscal_mode='dgii_ecf'`.
- Wizard step 1 does not persist `ecf_issuer_*` fields required by `fiscalEngine.ts:21-28`,
  so POS silently falls back to traditional NCF.
- e-NCF ranges persist only the start; end of range lives in React state.

## Why
DGII issuance is blocked; the wizard looks complete but is not.

## Decisions
- Certificate custody: CLOUD (Storage bucket `fiscal_certificates` + edge function + worker
  signs server-side). Decided by user 2026-10-17. Rationale: worker/docs assume it; works for
  web and desktop.

## Scope
In: certificate cloud custody wiring, issuer fields persistence, e-NCF range persistence,
activation writes fiscal mode (plan gate preserved), readiness checks consistent with the worker.
Out (follow-ups, need separate authorization): e-CF reception, commercial approval (ACECF),
range voiding (voidENCF), DGII-defined contingency, long-term archival (user mentioned 12 years;
legal retention period NOT yet verified — candidate: Cloudflare R2 immutable backup),
worker deployment config.

## Constraints
- Supabase migrations are written as files; applying to production requires user confirmation.
- Never log or return the .p12 bytes or password; password stored encrypted only.
- Keep local-first behavior for offline POS; do not break fallback mode.
- Activation stays gated by plan (`canUseFeature`).

## Route
Delegated direct (mapping done by an explorer; writer trigger: 2+ non-trivial files per task).

## TDD
Mode: off (no project TDD config). Source: no config found. Runner: `npm test` (vitest), `npm run typecheck`.
User norm: typecheck + vitest after every change, tests for all new logic.

## Review / delivery
RDD: off (default). Delivery strategy: ask-on-risk.

## Tasks
- [x] T1 Certificate cloud custody: migration adding `storage_ref` + `password_encrypted` to
  `ecf_certificate_metadata` (if missing); CertificateUploader uploads via edge function
  `validate-ecf-certificate` (not direct metadata insert with is_ready=true); `is_ready` only
  set by the edge function after successful validation + storage; tests.
- [x] T1b Certificate replacement + health (added 2026-10-17, user-authorized):
  (a) after a new .p12 validates and its metadata row is saved, the edge function deletes the
  previous object in `fiscal_certificates` (server-side, service role; failure to delete is logged,
  never fails the upload); (b) certificate health status with reason + action, shown in the
  uploader/activation UI: expired, expiring soon (<= 30 days), wrong password, RNC mismatch with
  tenant, invalid/unsupported file, environment mismatch, worker signing failures
  (CERTIFICATE_NOT_FOUND / decrypt errors) — each maps to a clear neutral-Spanish message telling
  the user whether to request a new certificate, re-enter the password, or contact support;
  pure function + tests; (c) remove dead Electron IPC `validateEcfCertificate` (main + preload)
  and its local safeStorage copy.
- [x] T1c Worker writes certificate failure reason to `last_validation_error` (so health banner
  shows signing failures); edge function deletes the just-uploaded object when validation fails.
- [x] T1d Security lockdown: migration `20261017130000_ecf_certificate_metadata_lockdown.sql`
  revokes table-level client grants (prod had anon/authenticated INSERT/SELECT/UPDATE/DELETE, so
  password_encrypted was readable and is_ready writable from the browser); authenticated keeps
  SELECT on non-secret columns. Client code only selects safe columns and never writes (verified).
- [x] T2 Issuer data: wizard step 1 persists all `ecf_issuer_*` fields required by
  fiscalEngine; validation mirrors fiscalEngine requirements (shared helper); tests.
- [x] T3 e-NCF ranges: persist start and end per type; tests.
- [x] T4 Activation: `activateElectronicBilling()` writes `fiscal_mode='dgii_ecf'` (+ environment)
  when readiness passes (cert ready in cloud, issuer complete, ranges set, plan allows);
  pure readiness function shared with Ajustes; tests.

## Acceptance
- After wizard completion, tenant row has fiscal_mode `dgii_ecf`, complete issuer fields, ranges.
- `ecf_certificate_metadata` row has storage_ref + password_encrypted; worker
  `certificateCustody` can load it (unit-tested with mocks).
- Missing any requirement keeps activation disabled with a clear reason.
- typecheck and vitest pass.

## Progress / evidence
- T1 done. Route: delegated direct (writer). Checks: `npm run typecheck`: pass; `npm test`: 148 files passed, 832 tests passed (2 skipped).
  Notes: client uploads .p12 to private bucket `fiscal_certificates` at `<tenant_id>/<env>-<ts>.p12`, then invokes edge function
  `validate-ecf-certificate` ({environment, storage_path, passphrase}); only the function sets is_ready. Local Electron
  IPC path removed from the uploader. Migration `20261017120000_ecf_certificate_cloud_custody.sql` is NOT applied remotely.
  Env required: edge function `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ECF_ENCRYPTION_KEY`
  (same `ecf-v1:` key as the worker; AES-256-GCM scheme verified compatible with worker/fiscal/crypto.ts).
  Commit: see git log (feat(fiscal): upload e-CF certificate to cloud custody via edge function).
- T1b done (3b9faec, 167477a). Checks: `npm run typecheck`: pass; `npm test`: 149 files passed, 866 tests passed (2 skipped).
  Notes: edge function now returns `{error, code}` (WRONG_PASSWORD, INVALID_FILE, CERTIFICATE_EXPIRED, FORBIDDEN, SAVE_FAILED, ...),
  clears `last_validation_error` on success, and deletes the previous tenant-scoped object after the upsert (non-fatal on failure).
  Health logic: `src/features/ajustes/lib/ecfCertificateHealth.ts`, rendered as banner in CertificateUploader (also used by
  ActivationPanel). No new columns; only existing `valid_until`, `last_validation_error`, `environment`. Electron IPC removed.
  Deploy: redeploy `validate-ecf-certificate` after applying the T1 migration (unchanged).

## Next step
T5 (RPC enforces range end; separate authorized SQL change).
- 2026-10-17: migration 20261017120000_ecf_certificate_cloud_custody APPLIED to production (cloudix-db.azokia.com) with user approval; verified columns storage_ref/password_encrypted, unique index, storage INSERT policy, bucket private. Found client table grants too broad → T1d lockdown migration written, pending approval.
- 2026-10-17: T1d lockdown migration APPLIED to production with user approval. Verified: no table grants for anon/authenticated; authenticated cannot SELECT password_encrypted/storage_ref nor INSERT/UPDATE/DELETE; can SELECT app columns; service_role keeps full access. Live test as role authenticated: app select ok, read password blocked, update is_ready blocked.
- 2026-10-17: T1c done. Checks: `npm run typecheck`: pass; `npm test`: 150 files passed, 883 tests passed (2 skipped).
  Worker: pure `classifyCertificateFailure` (worker/fiscal/certificateFailure.ts) -> code written to `ecf_certificate_metadata.last_validation_error`
  (by id + tenant_id) via optional repo methods `recordCertificateFailure` / `clearCertificateFailure` (clear only if non-null, after a successful signing);
  write failures are logged and never change the job outcome; DGII/invoice errors never touch the row. Edge function: `rejectUpload` removes the
  just-uploaded object on WRONG_PASSWORD/INVALID_FILE/CERTIFICATE_EXPIRED (tenant folder only, never the currently stored ref, non-fatal).
  Deploy: redeploy `validate-ecf-certificate`; restart the fiscal worker.
- 2026-10-17: T1c follow-ups done (bb18e1b): edge function removes the just-uploaded object on SAVE_FAILED (tenant folder only, never the stored ref, non-fatal);
  worker records retryable certificate errors only from attempt 5 (`certificateFailureAttemptThreshold`, default 5) because the worker has NO hard retry cap
  (retryable jobs retry indefinitely), so "terminal" never occurs for them; non-retryable errors still write immediately. Deploy: redeploy edge function; restart worker.
- 2026-10-17: T2 done (ada1578, UI in b499024). Shared pure helper `src/shared/lib/ecfIssuerRequirements.ts` (required fields, RNC 9/11 digits, email format, Spanish messages)
  used by `fiscalEngine.isEcfIssuerConfigComplete` and ActivationPanel. ROOT CAUSE of the regression found: `SAFE_TENANT_KEYS` in localFirst lacked `email` and all `ecf_issuer_*`,
  so any tenants update containing them was resolved `server_wins` and silently dropped; added them (+ test). Wizard step 1 again has the 5 technical issuer inputs and persists
  them (RNC saved as digits only). Behavior change: fiscalEngine now also rejects a malformed RNC/email (falls back to fiscal_mode_fallback) instead of only checking non-empty.
- 2026-10-17: T3 done (b499024). Range shape: keep `ncf_secuencias_por_tipo` as the numeric next-number map (read by cloudix_reserve_ecf which casts to integer, by normalizeNcfSequenceMap
  which drops non-numeric/unknown keys, and rewritten whole by Ajustes) and add NEW column `tenants.ecf_secuencias_rangos jsonb` = {E31:{start,end}}; used = next - start (single counter).
  A key inside the existing jsonb was rejected because Ajustes saves would erase it. Wizard writes the two columns as two separate local writes so a column deploy lag cannot block counters;
  the load reads bounds in a separate query and ignores errors (legacy fallback start=next, size 1000). Pure `src/shared/lib/ecfSequenceRanges.ts` (restore/validate/build payload; errors:
  start<1, end<start, next outside range, exhausted; warning when <10% remains) + tests.
  MIGRATION FILE NOT APPLIED: supabase/migrations/20261017140000_add_tenants_ecf_secuencias_rangos.sql (additive, idempotent). Apply before deploying the app build or the ranges write stays pending in the outbox.
  Follow-up (not done): enforce `end` inside cloudix_reserve_ecf (RPC currently ignores the end) - needs a separate authorized SQL change.
- Checks (T1c follow-ups + T2 + T3): `npm run typecheck`: pass; `npm test`: 153 files passed, 1 skipped, 913 tests passed (2 skipped).
- 2026-10-17: migration 20261017140000_add_tenants_ecf_secuencias_rangos APPLIED to production with user approval. Verified: jsonb NOT NULL default '{}', 4/4 tenants have '{}', authenticated has SELECT/UPDATE on the column (wizard write path works).
- 2026-10-17: T4 done. Checks: `npm run typecheck`: pass; `npm test`: 154 files passed, 1 skipped, 933 tests passed (2 skipped).
  Pure `src/shared/lib/ecfActivationReadiness.ts` (plan via canUseFeature(plan,'dgii_ecf'), environment, issuer, certificate health for the selected env, >=1 valid persisted range) + `src/features/fiscal/lib/loadEcfReadiness.ts` (reads persisted state). Wizard and Ajustes selector both use it.
  Activation payload: fiscal_mode='dgii_ecf', ecf_environment, ncf_fiscal_activo=true (cloudix_reserve_ecf raises unless true; Ajustes load already derives true for dgii_ecf), updated_at. Deactivation: fiscal_mode = tenant fiscal_mode_fallback (internal_receipt|ncf_legacy), ncf_fiscal_activo = (fallback==='ncf_legacy').
  Fiscal modes in code: internal_receipt | ncf_legacy | dgii_ecf. Open: semantics of ncf_fiscal_activo when deactivating are derived from Ajustes' load rule, not confirmed by product.
