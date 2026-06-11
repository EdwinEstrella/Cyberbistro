## Exploration: integrate-dgii-ecf

### Current State
Cyberbistro currently supports two implicit fiscal behaviors inside the Electron renderer: internal receipt when `tenants.ncf_fiscal_activo = false`, and legacy NCF when it is `true`. `Ajustes.tsx`, `tenantBillingSettings.ts`, and the checkout UIs are still typed around `NcfBCode` and B-sequence management, even though `ncf.ts` already lists E-type codes. Invoice creation is duplicated in `Dashboard.tsx` and `MesaCloseAccountModal.tsx`, where the renderer reserves NCFs, writes `facturas`, updates related rows, and triggers receipt printing. Offline persistence is generic CRUD sync through IndexedDB (`localFirst.ts` + `sync_outbox`), `facturas.estado` is used for payment state, and printed receipts only understand current NCF/payment data. There is no secure fiscal worker, no certificate storage/upload boundary, no DGII track/status lifecycle, and no e-CF tables. Current renderer-side upload and localStorage patterns used for logos and auth must NOT be reused for `.p12` material.

### Affected Areas
- `src/features/ajustes/components/Ajustes.tsx` — current tenant fiscal configuration is a legacy boolean + B-type sequence editor.
- `src/shared/lib/tenantBillingSettings.ts` — billing settings are normalized as `NcfBCode`, not as a fiscal mode/state model.
- `src/shared/lib/ncf.ts` — contains E-type labels, but active helpers still center on legacy B-sequence reservation rules.
- `src/shared/lib/invoiceNcf.ts` — reserves legacy NCF values through `cloudix_reserve_ncf` and tenant sequence updates.
- `src/features/dashboard/components/Dashboard.tsx` — takeout checkout duplicates fiscal reservation, invoice creation, local-first enqueue, and printing.
- `src/features/billing/components/MesaCloseAccountModal.tsx` — table/split checkout duplicates the same fiscal logic and will drift if not unified.
- `src/shared/lib/localFirst.ts` — local mirror, outbox, conflict rules, DB versioning, and offline license gates will need new fiscal tables/statuses.
- `migrations/*.sql` and `test/schema-ci.sql` — schema/RLS/test snapshots currently cover legacy `facturas` + NCF, but not DGII e-CF entities.
- `src/shared/lib/receiptTemplates.ts` and `src/features/billing/components/Billing.tsx` — printed representation only supports current receipt/NCF output.
- `electron/preload.ts` and `electron/main.ts` — current IPC surface only exposes print/update flows; no secure certificate handling path exists.
- `src/shared/lib/tenantLogoStorage.ts` — existing renderer `File` upload + public storage pattern is a bad fit for private fiscal certificates.

### Approaches
1. **Dedicated remote fiscal worker** — Keep the POS responsible for business data and fiscal intent, but move certificate use, XML signing, DGII submission, polling, and final tax status to a secure Node.js worker outside the renderer.
   - Pros: Meets the secret-boundary rule, supports multi-device tenants, fits existing local-first sync by letting the client push rows first and DGII processing happen later, and keeps DGII truth server-side.
   - Cons: Requires new infrastructure, async state handling, secure certificate upload/storage, and a clearer fiscal data model.
   - Effort: High

2. **Electron main-process fiscal signer** — Add new preload/main IPC so the desktop app handles `.p12` files locally and signs/sends e-CF directly from the installed POS.
   - Pros: Lower initial backend scope and avoids storing the certificate in React state.
   - Cons: Violates the tenant-central worker architecture, couples compliance to each PC, complicates multi-device/offline reconciliation, and still keeps fiscal secrets on customer hardware.
   - Effort: Medium

### Recommendation
Use the dedicated remote fiscal worker approach. The codebase already treats the renderer as an untrusted boundary (`anonKey` only, `contextIsolation`, printer-only IPC), and the existing local-first architecture is a better fit for “sell now, synchronize fiscal processing later” than for local certificate custody. Recommended slice order across #39-#48:

- **#39**: introduce an explicit tenant fiscal mode/config contract (`internal_receipt`, `ncf_legacy`, `dgii_ecf`) without breaking current legacy fields.
- **#40**: add dedicated e-CF tables, certificate metadata, fiscal outbox, and fiscal status fields; register them in `localFirst.ts` instead of overloading `facturas.estado` or the client `sync_outbox` status.
- **#41 + #42**: deliver the secure Node.js worker plus certificate upload/validation before any DGII send flow.
- **#43**: extract a unified fiscal engine/service so `Dashboard.tsx` and `MesaCloseAccountModal.tsx` stop duplicating invoice/fiscal logic.
- **#44 + #45**: implement online DGII submission and offline pending/sync transitions on top of the new engine.
- **#46 + #47 + #48**: finish printed e-CF representation, fiscal operations UI, and regression/security coverage.

### Risks
- Current renderer-side secret/file patterns (`LoginForm.tsx`, `useAuth.ts`, `tenantLogoStorage.ts`) create a real risk of accidentally handling `.p12` material in the wrong layer.
- `Dashboard.tsx` and `MesaCloseAccountModal.tsx` already duplicate fiscal logic; adding e-CF before unifying them will create inconsistent behavior.
- `facturas.estado` currently means payment state, not DGII state; reusing it for e-CF would mix payment and tax workflows.
- Test SQL snapshots appear behind recent migrations, so schema-based verification may drift unless e-CF changes update the test baseline strategy too.

### Ready for Proposal
Yes — the proposal should lock the fiscal domain model and trust boundaries first, then phase delivery by data model, secure worker, unified engine, and finally online/offline DGII flows.
