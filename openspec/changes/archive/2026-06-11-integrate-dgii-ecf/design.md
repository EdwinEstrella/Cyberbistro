# Design: Integrate DGII e-CF

## Technical Approach

Add e-CF as a fiscal subsystem beside existing invoice/payment flows. Tenant mode selection drives a unified fiscal engine used by takeout and table checkout. Legacy `facturas` writes remain intact; e-CF uses dedicated tables, local-first fiscal outbox rows, and a trusted Node.js worker for `dgii-ecf`, `.p12`, signing, DGII submission, polling, and acceptance truth.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Fiscal mode model | Add explicit `internal_receipt`, `ncf_legacy`, `dgii_ecf` while mapping current `ncf_fiscal_activo` values. | Replace legacy fields immediately. | Preserves current tenants and lets rollout gate e-CF readiness. |
| Status separation | Keep `facturas.estado` as payment state; add e-CF fiscal document/status/outbox state. | Reuse `facturas.estado` or client `sync_outbox.status`. | Payment, client sync, and DGII acceptance are independent lifecycles. |
| Secret boundary | Use remote Node worker with server-side `.p12` custody and `dgii-ecf`. | Electron main signer or renderer upload/storage. | `dgii-ecf` is server-side only; renderer/localStorage/IndexedDB must never receive certificate secrets. |
| Offline model | Store local fiscal intent as pending sync, then create processable server fiscal outbox after generic writes sync. | Submit to DGII directly from desktop offline queue. | Keeps local-first POS behavior while DGII truth remains server-confirmed. |
| Checkout integration | Extract shared fiscal engine from duplicated Dashboard and Mesa close logic. | Add e-CF branches independently in each component. | Avoids drift across takeout, table, and split invoices. |

## Data Flow

    Checkout UI
      -> fiscal engine resolves tenant mode
      -> facturas insert remains local-first/server-first
      -> e-CF fiscal intent + local pending state
      -> sync to server fiscal outbox
      -> Node worker signs/submits/polls DGII
      -> fiscal status table drives UI/print/panel truth

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/*_dgii_ecf*.sql` | Create | Add fiscal mode columns, e-CF document tables, certificate metadata, fiscal outbox, RLS, indexes. |
| `test/schema-ci.sql` | Modify | Keep schema snapshot aligned with e-CF tables/RLS. |
| `src/shared/lib/tenantBillingSettings.ts` | Modify | Normalize explicit fiscal mode while preserving boolean fallback. |
| `src/shared/lib/ncf.ts` / `invoiceNcf.ts` | Modify | Keep B-series helpers legacy-only; expose e-CF type labels without local sequence reservation. |
| `src/shared/lib/localFirst.ts` | Modify | Register fiscal mirror/outbox stores and pending fiscal sync reads. |
| `src/shared/lib/fiscalEngine.ts` | Create | Shared fiscal orchestration for checkout flows. |
| `src/features/dashboard/components/Dashboard.tsx` | Modify | Replace inline fiscal invoice logic with fiscal engine calls. |
| `src/features/billing/components/MesaCloseAccountModal.tsx` | Modify | Use the same engine for table and split invoices. |
| `src/shared/lib/receiptTemplates.ts` / `Billing.tsx` | Modify | Show pending/submitted/accepted/rejected fiscal state truthfully. |
| `electron/main.ts` / `electron/preload.ts` | Modify | Keep printer/update IPC only; do not add certificate secret IPC. |
| `worker/fiscal/*` | Create | Node worker using `dgii-ecf` for certificate validation, signing, submission, polling. |

## Interfaces / Contracts

```ts
type FiscalMode = "internal_receipt" | "ncf_legacy" | "dgii_ecf";
type EcfFiscalStatus = "pending_sync" | "queued" | "signed" | "submitted" | "accepted" | "rejected" | "retryable_error" | "terminal_error";
```

Renderer-visible certificate data is metadata only: certificate id, subject, issuer, valid dates, readiness, and last validation error. Secret material stays in server/worker storage.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Fiscal mode normalization, legacy NCF helpers, fiscal engine decisions, status labels. | Vitest around `tenantBillingSettings`, `ncf`, `fiscalEngine`. |
| Local-first | Pending e-CF fiscal intent, reconnect sync, no accepted display offline. | Extend `localFirst.test.ts` with fiscal stores/outbox cases. |
| Schema/RLS | Tenant isolation, certificate metadata access, fiscal outbox worker access. | Migration tests plus `schema-ci.sql` update. |
| Worker | `.p12` validation, idempotent jobs, DGII status mapping. | Mock DGII endpoints and `dgii-ecf` responses; no renderer tests handle secrets. |
| Regression | Internal receipt, legacy NCF online/offline, takeout/table/split invoice printing. | Existing component/service tests plus targeted checkout regressions. |

## Migration / Rollout

Phase by capability: add mode fields with backward-compatible defaults, add e-CF schema/outbox, deploy worker and certificate validation, switch checkout to the fiscal engine, then enable `dgii_ecf` per tenant after readiness checks. Rollback disables `dgii_ecf`, stops worker processing, leaves e-CF records auditable, and routes sales through configured non-e-CF modes.

## Open Questions

- [ ] Confirm DGII certification/production credentials and legal acceptance wording.
- [ ] Confirm where InsForge secrets/storage should hold encrypted `.p12` material for worker-only access.
