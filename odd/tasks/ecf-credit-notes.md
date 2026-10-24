# ecf-credit-notes

## Objective
Issue an e-CF credit note (E34) that fully reverses an accepted E31 or E32 invoice from the invoice
list, send it to the DGII through the fiscal worker, print it, and take the refunded money out of the
current cash register shift.

## Product decisions (user, 2026-10-24)
- Total reversal only (CodigoModificacion 1, "Anulación total"); partial returns later.
- Original must be E31/E32 with DGII status accepted; one credit note per invoice.
- Admin only; online only; within 30 days of the original (IndicadorNotaCredito 0); reason text required.
- Money: refund leaves the current open shift's cash ("sale de la caja por ahora").
- No inventory reversal in v1.

## Facts (mapper 2026-10-24)
- No void/refund/credit-note flow exists; Billing.tsx only hard-deletes (must be blocked for invoices with an e-CF).
- `cloudix_reserve_ecf` already supports E34 with range enforcement (tenant has E34 1..10000).
- worker/fiscal/mapper.ts lacks InformacionReferencia / IndicadorNotaCredito; dgiiAdapters sends E34 as full e-CF.
- Printing: ecfPrintedRepresentation/ecfReceiptLayout already render E34 references.
- ecf_documents.factura_id is UNIQUE → the credit note needs its own factura row (or new key scheme).

## TDD
On. Runner: `npx vitest run`, `npm run typecheck`.

## Delivery
Branch to be created after comandas-cierre-cleanup. ask-on-risk; likely > 400 lines → chained PRs.

## Tasks
- [x] T1 Explore cash-out mechanism of the shift (cierre/cuadre) and decide the refund record.
      Route: delegated mapper. Decision: refund = `gastos` row in the open cycle (expense_type
      'operational', dedicated "Devolución / Nota de crédito" category, description with E34 + original
      e-NCF), written in the same SQLite transaction + outbox as the E34 (copy tenantStore.ts ~L1018-1047
      CxP precedent); cash only reduces the drawer via sumCashExpenses (cycleCash.ts:35). Non-cash
      originals: gasto with the original method (cierre ignores it). Fiado pendiente: reverse CxC instead.
      Block if no open cycle. E34 must NOT be a facturas row with negative total (CHECK total >= 0;
      unfiltered sums in Cierre.tsx:160-187, tenantStore.ts:317, reserveInvoiceNumbers L1260/L1290).
      Preferred: E34 lives in ecf_documents (document_type E34, new nullable related_factura_id; relax
      factura_id UNIQUE/NOT NULL) — to validate against worker claim SQL (joins facturas f ON fo.factura_id).
- [x] T2 Data model + issue RPC (cloud migration, local schema). Route: delegated writer (mapping trigger).
      Branch feat/ecf-credit-notes-01-data. Migration 20261024130000_ecf_credit_notes.sql APPLIED to prod 2026-10-24 (verified); PR #82 merged (8603e0d); Dokploy worker mapper.ts redeployed + restarted.
      E34 = own facturas row (estado 'nota_credito'); RPC cloudix_issue_credit_note also books the refund
      gasto + category in the open cycle (moved here from T5); fiado originals rejected (v1).
      Sales exclusion via isSaleInvoice (invoiceKind.ts): Cierre summarizeCycleSales, readAnalyticsSummary,
      Billing KPIs. Evidence: new tests green; typecheck clean; vitest 211 files / 1535 passed / 2 skipped.
- [x] T3 Worker mapper E34 (InformacionReferencia, IndicadorNotaCredito) + claim payload reference.
      Branch feat/ecf-credit-notes-02-worker. Claim SQL already uses to_jsonb(f.*), so ref_* columns arrive
      unchanged. Mapper fails closed on bad ref; reason capped at 90 chars; E34 never RFCE (only TipoeCF 32
      converts; guard test added). Order follows dgii-ecf reference ecf.ts (no XSD in repo): IndicadorNotaCredito
      after eNCF, InformacionReferencia after DetallesItems. FechaVencimientoSecuencia still not emitted (mapper-wide
      gap, see ecf-pos-local-signing). Evidence: vitest 213 files / 1553 passed / 2 skipped; typecheck clean.
- [ ] T4 UI: new sidebar entry "Notas de crédito" (user 2026-10-24) listing accepted E31/E32 invoices
      with issue button + reason dialog + issued-notes list/badges; block hard delete for e-CF invoices in Billing.
- [ ] T5 Print E34 (cash-out gasto already created by the T2 RPC).
- [ ] T6 CI green, release, production test with a real invoice.

## Progress
- 2026-10-24: mapping done; decisions recorded.

## Next step
T4 sidebar UI "Notas de crédito" (list accepted E31/E32, issue button + reason dialog, block hard delete for e-CF invoices).
