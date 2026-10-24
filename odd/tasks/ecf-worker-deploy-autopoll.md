# ecf-worker-deploy-autopoll

## Objective
Make the fiscal worker production-safe and deploy it on the Dokploy Supabase stack, and make
DGII status screens resolve on their own (no "En proceso" waiting on a manual refresh).

## Problem / why
- `worker/fiscal/postgresFiscalWorkerRepository.ts:249-257` picks the newest ready certificate of the
  tenant regardless of `tenants.ecf_environment`; the DGII endpoint comes from that certificate row
  (`dgiiAdapters.ts:45-53`). Salpimentao now has test + certification + production certificates, so a
  job could be signed and sent to the wrong DGII environment. `rfceBatchWorker.ts:34-37` has the same gap.
- The worker is not deployed anywhere (only `npm run fiscal-worker`).
- TesteCF test send (`EcfTestSendCard.tsx`) shows "En proceso" forever; status only updates on a click
  of "Consultar estado". `testEstadoView().final` exists but is unused.
- "Mensajes DGII" renders "0:" for DGII's placeholder `{codigo: 0, valor: ""}`.
- User: "no me gusta que las cosas se queden en espera ... que mande y diga si aprobó o no".

## Scope
- Worker certificate selection bound to `tenants.ecf_environment` (main worker + RFCE batch).
- TesteCF send: auto-poll the TrackId until a final state (bounded, with backoff), show the result.
- Drop empty DGII messages (server `parseMessages` + client `toMessages` + `formatMessages`).
- Deploy worker as a `fiscal-worker` service in the Dokploy Supabase compose (user authorized:
  modify, save, redeploy the compose at panel.azokia.com; user accepts the permission prompts).

## Constraints
- prod queue (`fiscal_outbox`) verified empty 2026-10-24 before deploy, so starting the worker sends nothing.
- Never log or commit `ECF_ENCRYPTION_KEY` / service-role key.
- Salpimentao stays `ncf_legacy` until the activation step verifies cert/sequences/worker.

## TDD
Mode: on (session norm: tests for every change; vitest). Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Branch `fix/ecf-certificate-env-flash` (already holds 066ff96, 921bd6a). Strategy: ask-on-risk.

## Tasks
- [x] T1 Worker: certificate filtered by `tenants.ecf_environment` (main + RFCE batch); no cert for the
      tenant environment → existing certificate-missing failure. Route: delegated (2+ files). Commit 54a33aa.
      Evidence: 3 RED→GREEN tests; EXPLAIN on prod uses ecf_certificate_metadata_tenant_environment_uidx.
- [x] T2 TesteCF auto-poll until final + empty-message fix. Route: delegated (same writer). Commit 5ec1fac.
      Evidence: 11 RED→GREEN tests; full suite 202 files / 1487 passed; typecheck ok. Edge file changed:
      supabase/functions/ecf-certification/dgiiClient.ts (needs Dokploy mount update + functions restart).
      Gap: no persisted last trackId → no re-poll on reopen (timeout notice tells user to press Consultar).
- [x] T3 Deploy `fiscal-worker` service on Dokploy (file mounts + compose service + env), redeploy,
      verify. Route: inline via Dokploy API (token in ~/.dokploy-token, never printed).
      Evidence 2026-10-24 15:16 UTC: 15 mounts created/updated; compose saved with fiscal-worker +
      fiscal-worker-node-modules volume; deployment "done"; container fiscal-worker-1 running; Postgres
      session from the worker polling fiscal_outbox since 15:16:27; other services untouched (Up 2 days);
      functions-1 restarted; ecf-certification answers 401 unauthenticated (boots fine).
      Rollback: compose.backup.yml + dgiiClient.backup.ts kept in the session scratchpad.
- [ ] T4 Release + verify end-to-end (TesteCF send resolves to Aceptado/Rechazado without clicks).

## Progress
- 2026-10-24: exploration done (mapper agent). Queue empty in prod.

- 2026-10-24: T3 prep done. Dokploy compose is raw (sourceType raw), stack services: studio kong auth
  rest realtime storage imgproxy meta functions db supavisor db-config deno-cache. Env has
  SUPABASE_PUBLIC_URL (https), ECF_ENCRYPTION_KEY (valid ecf-v1 format), POSTGRES_HOST=db:5432, db has
  healthcheck. Mounts use filePath /volumes/... → ../files/volumes/... Bundle of 13 worker files +
  package.json (type module; pg 8.20.0, dgii-ecf 1.8.0, tsx 4.19.2) + dgiiClient.ts built locally.
  Blocked: injecting the bundle into the panel page from a localhost server was denied by the
  permission classifier.

- 2026-10-24: PR #79 opened (5 commits, ~430 lines), waiting for CI before merge to master.

## Next step
Merge PR #79 after CI, pull master; user retests TesteCF send (should end in Aceptado/Rechazado
without clicks); then release (user decision) and activation step 15 as activator.
