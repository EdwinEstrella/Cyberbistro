# Feature: offline-pos-sales

## Objective
The desktop POS must keep selling (including fiscal NCF sales) while the cloud backend is unreachable. Local-first is a hard requirement.

## Problem
2026-10-21 the self-hosted Supabase (cloudix-db.azokia.com) returned HTTP 530 (origin down). Customers could not operate:
- Dashboard shows "No tenés sucursal configurada todavía" (activeSucursalId null).
- Fiscal sales fail with "No se pudo reservar NCF": desktop always calls the cloud RPC `cloudix_reserve_ncf` (`src/shared/lib/invoiceNcf.ts:83`) because `shouldUseIndexedDb()` excludes desktop (`src/shared/lib/localFirst.ts:617,746`). Offline NCF existed (May 2026, IndexedDB mirror) and regressed during the SQLite cutover.
- Camarera kitchen ticket silently skipped offline (`Camarera.tsx:407` cloud-only tenants read).
- `runFiscalEngine` fails closed when the local tenants mirror lacks billing settings.

## Constraints
- One sales caja per business (user confirmed 2026-10-21) → a local NCF sequence on that device is safe; no multi-device block allocation needed.
- SQLite in Electron main is local truth; the cloud is a sync target. No new IndexedDB writes on desktop.
- NCF must never be issued twice: local reservation must be atomic and the cloud sequence must catch up (never move backwards) on sync.
- Prod DB writes/migrations require explicit user OK.

## Tasks
- [x] T1 Sucursal resolves offline (desktop): diagnose why activeSucursalId is null with cloud down and fix so the POS always has a branch from local data.
- [x] T1b Sucursales pulled into SQLite and read locally on desktop (real names/ids, not placeholders).
- [x] T1c Tenants (billing/NCF/print columns) pulled into SQLite and read locally on desktop — prerequisite for T2–T4.
- [x] T2 NCF/e-CF reservation from local SQLite on desktop (IPC), cloud sequence reconciled on sync without regressions or duplicates.
- [x] T3 Fiscal billing settings fall back to last-known local values instead of blocking.
- [x] T4 Camarera kitchen ticket prints offline using the local tenant mirror.
- [ ] T5 Release + verify offline journey.

## Acceptance criteria
With the cloud unreachable, a logged-in desktop caja that synced at least once can: see its sucursal, open a mesa, send a comanda (ticket prints), and charge a fiscal (B01/B02) invoice with a unique, sequential NCF that syncs later.

## Checks
- TDD mode: not configured (ordinary checks). Runner: `npm run typecheck`, `npm test` (vitest). User norm: typecheck + vitest after every change.

## Delivery
- Branch `fix/offline-pos-sales` from master f30d694. Strategy: ask-on-risk. Forecast < 400 lines per task.
- Unknown-origin uncommitted changes on master (legacy IndexedDB importer removal, 10 files) were set aside in `git stash` "unknown-origin: remove legacy IndexedDB importer (found 2026-10-21)" — not part of this feature.

## Progress
| Task | Route | Commit | Checks |
|------|-------|--------|--------|
| T1 | delegated (writer trigger: 2+ files) | a912cc1 | typecheck clean; vitest 1399 pass. Root cause: desktop readLocalMirror("sucursales") never read SQLite → [] offline; auth was fine (validated). Placeholder from defaultBranchId/allowedBranchIds. |
| T1b | delegated (writer trigger) | c6ba798 | typecheck clean; vitest 1408 pass (2 skipped). Pull applier + idempotent migration (direccion, telefono, activa, cloud_synced); only cloud_synced rows exposed; via existing catalog:list IPC. Unverified: prod RLS lets authenticated read sucursales. |

| T1c | delegated (writer trigger) | 5c2da26 | typecheck clean. Tenant row pulled as JSON with whitelisted columns (no certs/tokens); desktop readLocalMirror("tenants") reads SQLite first. |
| T2 | delegated (writer trigger) | a65a2ef | typecheck clean; vitest 1439 pass (2 skipped). Offline B-NCF via IPC ncf:local-sequence, start = max(local, known cloud, max local invoice+1); online RPC authoritative + recorded locally; connectivity-fail fallback; forward-only cloud catch-up on next online sale. e-CF stays cloud-only. No cloud migration. RDD off; risk high → independent verifier running. Unverified: RLS allows authenticated UPDATE on tenants. |

| T2 fix | delegated (one bounded correction) | e204440 | Verifier (opus, independent) FIX REQUIRED: catch-up UPDATE blocked by admin-only RLS for cajera → web duplicate risk. Fixed: SECURITY DEFINER RPC cloudix_advance_ncf_sequence (member check, forward-only GREATEST, all 3 counters), fallback to direct UPDATE when RPC missing, local-only reservation while cloud lags; fresh peek per returned type. typecheck clean; vitest 1450 pass. Migration `supabase/migrations/20261021120000_cloudix_advance_ncf_sequence.sql` NOT APPLIED — needs user OK once DB is back. |

| T3 | delegated (writer trigger) | 97d60a0 | Billing settings fall back to local tenant row on any cloud failure; still fail-closed with no local row. vitest pass. |
| T4 | delegated (writer trigger) | 45adb9a | Camarera kitchen ticket via resolveKitchenPrintTenant (cloud → local → minimal header). typecheck clean; vitest 1455 pass. App not run manually. |

## Next step
T5: user decides delivery (merge to master + release). Pending user decision: apply migration 20261021120000 to prod when DB is back.
