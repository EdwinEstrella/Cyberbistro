# Proposal: Integrate DGII e-CF

## Intent

Add DGII electronic fiscal comprobantes (e-CF) to Cyberbistro without weakening local-first POS behavior or exposing fiscal certificates to React, localStorage, or the Electron renderer. The first slice locks fiscal modes and trust boundaries so later schema, worker, certificate, online/offline, print, panel, and test slices share one contract.

## Scope

### In Scope
- Explicit fiscal mode model: `internal_receipt`, `ncf_legacy`, `dgii_ecf`, preserving legacy fields and behavior.
- New e-CF persistence/outbox/status lifecycle separate from `facturas.estado` and `sync_outbox`.
- Secure Node.js fiscal worker boundary for `.p12` custody, signing, DGII submission, polling, and truthful DGII acceptance display.
- Unified fiscal engine for takeout/table checkout, offline pending states, printed e-CF output, fiscal panel, and regression coverage.
- Non-regression for legacy NCF, internal receipts, and offline sales.

### Out of Scope
- Direct `.p12` handling in React/localStorage/renderer or Electron renderer-side DGII signing.
- Removing legacy NCF or internal receipts.
- Full DGII production rollout before certificate validation, worker, and status flows exist.

## Capabilities

### New Capabilities
- `tenant-fiscal-modes`: Tenant fiscal configuration and mode selection across internal receipts, legacy NCF, and DGII e-CF.
- `ecf-document-lifecycle`: e-CF tables, fiscal outbox, offline pending states, DGII tracking/status, and acceptance truth display.
- `secure-fiscal-worker`: Server-side certificate custody, XML signing, DGII submission/polling, and operational safeguards.
- `unified-fiscal-engine`: Shared checkout fiscal orchestration, print outputs, and fiscal operations panel across sale flows.

### Modified Capabilities
- None — no existing `openspec/specs/` capability specs are present.

## Approach

Phase delivery from domain contract first to infrastructure: fiscal modes (#39), e-CF schema/outbox (#40), secure worker and certificate upload (#41-#42), unified fiscal engine (#43), online/offline DGII flows (#44-#45), then printing, panel, and regression/security tests (#46-#48). Use InsForge/Postgres migrations and a remote Node.js worker; keep the renderer as untrusted POS UI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/`, `test/schema-ci.sql` | New/Modified | Fiscal config, e-CF tables, outbox, RLS/tests. |
| `src/shared/lib/*ncf*`, `tenantBillingSettings.ts` | Modified | Fiscal mode/types and legacy compatibility. |
| `src/features/dashboard/*`, `src/features/billing/*` | Modified | Shared fiscal engine, statuses, print/panel UI. |
| `electron/*`, worker service | New/Modified | Secure boundary; no renderer secret custody. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Certificate leakage | Med | Worker-only `.p12` custody; forbid renderer/localStorage paths. |
| Legacy regression | Med | Keep modes explicit and require NCF/internal/offline tests. |
| Async status confusion | Med | Separate DGII fiscal status from payment/sync states. |

## Rollback Plan

Disable `dgii_ecf` mode per tenant, stop worker processing, leave e-CF records read-only/auditable, and route sales through existing `internal_receipt` or `ncf_legacy` flows.

## Dependencies

- DGII e-CF test credentials/certificate, InsForge schema/compute/secrets support, fiscal legal acceptance rules.

## Success Criteria

- [ ] Tenants can select fiscal modes without breaking existing receipts/NCF/offline sales.
- [ ] No `.p12` data reaches React, localStorage, or renderer IPC.
- [ ] DGII acceptance is displayed only from server-confirmed status.
