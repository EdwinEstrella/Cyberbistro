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
- [ ] T1 Explore cash-out mechanism of the shift (cierre/cuadre) and decide the refund record.
- [ ] T2 Data model + issue RPC (cloud migration, local schema).
- [ ] T3 Worker mapper E34 (InformacionReferencia, IndicadorNotaCredito) + claim payload reference.
- [ ] T4 Billing UI: issue button + reason dialog + badges; block hard delete for e-CF invoices.
- [ ] T5 Print E34; cash-out record in the current shift.
- [ ] T6 CI green, release, production test with a real invoice.

## Progress
- 2026-10-24: mapping done; decisions recorded.

## Next step
T1 exploration (read-only) while comandas-cierre-cleanup is implemented.
