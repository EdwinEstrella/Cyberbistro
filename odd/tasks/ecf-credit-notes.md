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
      Branch feat/ecf-credit-notes-01-data. Migration 20261024130000_ecf_credit_notes.sql (NOT applied).
      E34 = own facturas row (estado 'nota_credito'); RPC cloudix_issue_credit_note also books the refund
      gasto + category in the open cycle (moved here from T5); fiado originals rejected (v1).
      Sales exclusion via isSaleInvoice (invoiceKind.ts): Cierre summarizeCycleSales, readAnalyticsSummary,
      Billing KPIs. Evidence: new tests green; typecheck clean; vitest 211 files / 1535 passed / 2 skipped.
- [ ] T3 Worker mapper E34 (InformacionReferencia, IndicadorNotaCredito) + claim payload reference.
- [ ] T4 Billing UI: issue button + reason dialog + badges; block hard delete for e-CF invoices.
- [ ] T5 Print E34 (cash-out gasto already created by the T2 RPC).
- [ ] T6 CI green, release, production test with a real invoice.

## Progress
- 2026-10-24: mapping done; decisions recorded.

## Next step
T1 exploration (read-only) while comandas-cierre-cleanup is implemented.
