# ecf-pos-local-signing

## Objective
When a tenant bills with e-CF (`fiscal_mode = dgii_ecf`), every printed 80 mm receipt is a complete DGII
Representación Impresa (QR, código de seguridad, fecha de firma digital) from the moment of the sale — also offline.
The desktop POS signs the e-CF at checkout; transmission to DGII is deferred (cloud fiscal worker).

## Problem / why
- User rule (2026-10-20): "si está activo no puede salir una factura sin comprobante".
- Today the fiscal worker signs after sync, so the receipt printed at checkout has no QR/security code.
- The .p12 lives only in cloud custody; no endpoint delivers it to a device.
- Latent bug: local SQLite `ecf_documents.status` CHECK allows only ('pending_sync','pending_processing') and
  `fiscal_outbox.status` only ('pending','syncing') (`electron/persistence/schema.ts:174,185,515,535`), but checkout
  writes 'pending_offline'/'pending_configuration' and 'pending_sync'/'blocked_configuration'
  (`tenantStore.ts:238,244`, `src/shared/lib/fiscalEngine.ts:168-237`). STRICT tables → the checkout transaction
  rolls back → desktop dgii_ecf checkout cannot commit.

## Facts (sources)
- DGII Informe Técnico e-CF (Mar 2026) §19: emisor without connectivity may sign/issue offline; RI must carry
  "e-CF emitido en modalidad de Contingencia, el cual podrá ser consultado para su validez fiscal, a partir de las
  setenta y dos (72) horas"; transmit within 72 h; stays electronic (no serie B). §18.2.3: QR bottom-left >= 22x22 mm,
  3 mm margin, 2 cm from edge; código de seguridad (first 6 of SignatureValue hash) + Fecha de Firma Digital
  (dd-MM-aaaa HH:mm:ss) under QR; fecha vencimiento secuencia in header; ITBIS per line; continuous-paper models exist.
  https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Informe%20T%C3%A9cnico%20e-CF%20v1.0.pdf
- No DGII rule forbids storing the .p12 on POS devices (gap: Reglamento 587-24 not read in full).
- Gaps: legend/plazo when DGII itself is down; RFCE (E32 < 250k) transmission deadline.
- Mapper `worker/fiscal/mapper.ts` and `RealXmlSigner` (`worker/fiscal/dgiiAdapters.ts:20-39`, npm dgii-ecf) have no
  server-only deps; worker always re-signs today (`fiscalWorker.ts` submit); mapper lacks FechaVencimientoSecuencia.
- Receipt: `src/shared/lib/receiptTemplates.ts` (buildFacturaReceiptHtml); correct QR builder already in
  `src/features/fiscal/lib/ecfPrintedRepresentation.ts` (buildPrintedQrUrl); 80 mm DGII layout `ecfReceiptLayout.ts`.
- Web build cannot sign locally: keeps cloud signing, receipt says "pendiente de firma".

## Scope
In: local schema fix + signed columns; cloud columns + anti-downgrade guard; worker skip-sign; shared bundle-safe
mapper/signer; local snapshot builder with parity tests; device certificate vault (Electron safeStorage) + IPC;
device certificate provisioning (edge function + table, wrapped delivery, revoke, audit); sign inside checkout +
DGII 80 mm receipt (contingency legend offline); signed-invoice void/edit policy (E34), 72 h backlog alert,
rejected-after-print surfacing; e2e.
Out: activating dgii_ecf for any tenant; production env switch; web local signing.

## Constraints
Never re-sign a document (security code/FechaHoraFirma must stay stable). p12/passphrase never reach the renderer.
Renderer never selects tenant/path/SQL (test/desktop-ipc-guard.test.ts). No unrelated dirty files in commits.
English code / Spanish UI. No AI attribution. Prod migrations only with user OK.

## Delivery
Strategy: stacked-to-main (user choice 2026-10-20): one small PR per work unit, merged to master when green; each
unit inert until dgii_ecf is activated. Forecast > 2000 authored lines.

## TDD
Mode: off (project convention). Runner: `npx vitest run`, `npm run typecheck`, e2e via CI.

## Tasks
- [x] T1 Local SQLite: relax ecf_documents/fiscal_outbox status CHECKs to the values the app writes; add signed
      columns (signed_xml, xml_hash, dgii_security_code, signed_at, signed_by_device); migration for existing DBs;
      failing-first test reproducing the rollback. Branch feat/ecf-pos-signing-01-local-schema.
- [ ] T2 Cloud: matching ecf_documents columns, sync push whitelist, guard against downgrading
      submitted/accepted/rejected.
- [ ] T3 Worker: skip map+sign when status = signed and signed XML present (verify hash/RNC/eNCF); emit
      FechaVencimientoSecuencia.
- [ ] T4 Shared bundle-safe module for mapper + signer used by worker and Electron main; externalization check.
- [ ] T5 Local snapshot builder (SQLite → mapper input) + parity fixtures vs cloud payload.
- [ ] T6 Electron certificate vault (safeStorage) + IPC status/provision (guard tests).
- [ ] T7 Device certificate provisioning edge function + table (wrapped to device key, revoke, audit).
- [ ] T8 Sign inside checkout; DGII 80 mm receipt (QR, código, fecha firma, vencimiento, ITBIS por línea,
      contingency legend); Ajustes e-CF preview sample.
- [ ] T9 Signed-invoice void/edit policy (E34), 72 h backlog alert, rejected-after-print UI.
- [ ] T10 E2E: offline checkout → reconnect → transmission → reprint.

## Progress
- 2026-10-20: research + mapping done; local CHECK bug confirmed by code reading; document created.
- 2026-10-20 T1 RED: test/local-sqlite-ecf-status-schema.test.ts checkout with 'pending_offline' failed with
  "CHECK constraint failed: status IN ('pending_sync', 'pending_processing')" (tenantStore.ts:238).
- 2026-10-20 T1 GREEN: schema.ts exports ECF_DOCUMENT_STATUSES / FISCAL_OUTBOX_STATUSES (union of app writes, cloud vocab,
  future signing states), adds signed_xml/xml_hash/dgii_security_code/signed_at/signed_by_device, and rebuilds stale tables
  (idempotent, copies all shared columns, recreates indexes). Checks: new test file 3/3, test/local-sqlite 30 files /
  148 tests pass, npm run typecheck clean. Updated local-sqlite-sales-fiscal-schema.test.ts (it asserted 'accepted' was
  unrepresentable locally; now uses 'bogus'). Commit: pending (parent commits).

- 2026-10-20 (parent review): narrowed local status sets to client-owned states only (ecf_documents: pending_offline,
  pending_configuration, pending_sync, pending_processing, signed; fiscal_outbox: pending, syncing, pending_sync,
  blocked_configuration). DGII outcomes stay server-owned per docs/fiscal-status-truths.md; restored the original
  'cannot represent local DGII acceptance' test. npx vitest run test/local-sqlite: 30 files / 148 passed; typecheck clean.

## Next step
T2.
