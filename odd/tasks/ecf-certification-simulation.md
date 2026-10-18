# ecf-certification-simulation

## Objective
DGII portal step 4 ("Pruebas de Simulacion e-CF"): generate, sign and send a simulation batch with the same scenarios
as the step-2 test set (user decision, option A), new never-used e-NCF sequences and today's dates; keep every signed
document for step 5 (printed representation with QR).

## Facts (verified 2026-10-18)
- Portal quotas: E31 x4, E32>=250k x2, E33 x1, E34 x2, E41 x2, E43 x2, E44 x2, E45 x2, E46 x2, E47 x2, E32 RFCE x4
  (consumo < 250k: RFCE via summaries service, then upload the full E32 in the portal). Identical to the step-2 set
  (sheet ECF 25 rows + RFCE 4 rows), which DGII accepted 100%.
- Sequences: 1..10,000,000 per type; must never be reused across attempts. Highest tenant-issued e-NCF used so far
  (test_set run): E31-010, E32-015, E33-001, E34-016, E41-010, E43-012, E44-009, E45-010, E46-007, E47-008. ACECF runs
  hold the DGII emitter's e-NCF (RNCEmisor 131880681) and must NOT count for allocation.
- In the DGII sets `#e` means empty. FechaVencimientoSecuencia = 31-12-2028.
- References in the set: E33-001 -> E32-006; E34-016 -> E41-010 (IndicadorNotaCredito=1, issued > 30 days after);
  E34-001 -> E31-001 (IndicadorNotaCredito=0). With all documents issued today, references must point to the NEW
  e-NCF + new FechaNCFModificado, and IndicadorNotaCredito must be recomputed (0 when <= 30 days).
- Step 5 needs a printed representation (PDF with QR) of every simulation e-CF: keep signed XML + security code.

## Scope
In: run_type 'simulation' (migration), simulation start from the step-2 workbook with overrides (new e-NCF per type,
today's FechaEmision, remapped references, recomputed IndicadorNotaCredito, FechaHoraFirma at signing), sequence
allocator that never reuses, sending via the existing send-next/status/download flow, wizard step 4 UI, tests.
Out: step 5 PDF generation (next feature), deployment.

## Constraints
Same as ecf-certification-testset (no secrets, tenant admin only, per-call token, migration file only, no DGII calls
from tests, do not commit pre-existing unrelated dirty files, English artifacts / Spanish UI).

## Route
Delegated direct (writer trigger). Stacked on feat/ecf-certification-acecf.

## TDD
Mode: off. Runner: `npx vitest run`, `npm run typecheck`.

## Tasks
- [x] T1 Backend: migration (run_type simulation + unique tenant-issued encf guard), allocator, overrides in builder, start action for simulation; tests. Commit 22406e1. Route: delegated (writer trigger).
- [x] T2 Wizard step 4 UI (reuse TestSetRunner with runType simulation, quotas summary); tests. Commit 2e7a1f5. Route: delegated (writer trigger).

## Progress
- 2026-10-18 created after user chose option A.
- 2026-10-18 T1 done (22406e1), T2 done (2e7a1f5).

## Design notes
- Guard: submissions get a denormalized `run_type` (set from the run by a BEFORE INSERT trigger, backfilled) and
  `source_case_id`. Partial unique index (tenant_id, environment, encf) WHERE run_type='simulation' AND kind IN
  ('ecf','portal_upload'); the trigger rejects (23505) a simulation row reusing a test-set e-NCF and vice versa.
  Test-set runs are NOT unique among themselves so step 2 can still be re-run with the same DGII workbook.
  Verified read-only on prod: 0 ecf/portal_upload e-NCF repeats across non-ACECF runs. Store maps 23505 to
  SequenceConflictError -> HTTP 409 SEQUENCE_CONFLICT (fail closed; restarting allocates fresh numbers).
- Allocator: per tipo, max(issued e-NCF of kinds ecf/rfce/portal_upload in test_set + simulation runs) + 1;
  ACECF excluded. Allocation happens at start; a second simulation never reuses the first one's numbers.
- Overrides (simulation.ts): ENCF, CasoPrueba (RNC + new e-NCF), FechaEmision = today (DR), shifted by the same
  delta: FechaLimitePago, FechaDesde, FechaHasta, FechaEntrega, FechaOrdenCompra, FechaEmbarque,
  FechaElaboracion[n], FechaVencimientoItem[n]; FechaVencimientoSecuencia kept; in-workbook NCFModificado ->
  new e-NCF, FechaNCFModificado -> today; IndicadorNotaCredito recomputed (<=30 days -> 0). External references
  keep NCFModificado/FechaNCFModificado. RFCE rows follow their E32.
- `download` for simulation runs returns any signed document (e-CF by default, `kind: "rfce"` for summaries) plus
  kind and securityCode; test-set download unchanged. Summary items now carry `sourceCaseId` and `signed`.

## Verification evidence (2026-10-18)
- `npm run typecheck`: clean.
- `npx vitest run`: 182 files passed, 1 skipped; 1300 tests passed, 2 skipped (RLS without DATABASE_URL).
- Local build from the real step-2 workbook (scratchpad only, throwaway cert, no DGII calls): 25 e-CF + 4 RFCE,
  29 planned, 29 signatures verified. New e-NCF: E31 011-014; E32 016 (>=250k, src 006), 021 (>=250k, src 004),
  017-020 (consumo, src 012-015, each portal_upload + RFCE); E33 002 -> NCFModificado E32-016; E34 017 ->
  E41-011 (Ind 0), E34 018 -> E31-011 (Ind 0); E41 011-012; E43 013-014; E44 010-011; E45 011-012; E46 008-009;
  E47 009-010. All FechaEmision 18-10-2026; e.g. E46-009 FechaLimitePago 22-11-2026, FechaEmbarque 27-10-2026.

## Redeploy (supabase/functions/ecf-certification)
- New: simulation.ts. Changed: builder.ts, run.ts, store.ts.

## Next step
Apply migration 20261018160000_ecf_certification_simulation.sql, then redeploy the four files above and restart
functions; run step 4 from the wizard. Then step 5 (printed representation) as a new feature.
