# Fiscal Status Truths and Lifecycle

This document establishes the architecture, lifecycle states, and behavioral rules of the electronic invoicing (e-CF) system integrated with the DGII (Dirección General de Impuestos Internos).

## 1. Fiscal Status Lifecycle

The system separates the **fiscal status** of an invoice from its **payment status** (`facturas.estado`) and the **local-first replication state** (`sync_outbox`).

```
                    [ Offline Checkout ]
                             │
                             ▼
                     "pending_sync"  (Local-First Outbox)
                             │
                      [ Network Sync ]
                             │
                             ▼
                         "queued"    (Server Outbox)
                             │
                     [ Worker Claims ]
                             │
                             ▼
                         "signed"    (XML Signed with Certificate)
                             │
                    [ Submit to DGII ]
                             │
                             ▼
                        "submitted"  (Track ID Received)
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
               "accepted"         "rejected"
```

### State Definitions

| Status | Component | Description |
|---|---|---|
| `pending_sync` | Client (Local-First) | The e-CF invoice was generated offline. Rows are queued locally in `ecf_documents` and `fiscal_outbox` waiting for internet connection. |
| `queued` | Server (Outbox) | The local rows have replicated to the server's Postgres database. The job is ready to be claimed by the fiscal worker. |
| `signed` | Server (Worker) | The fiscal worker has validated the certificate, retrieved the p12 bytes securely, signed the XML, and stored the deterministic SHA-256 hash. |
| `submitted` | Server (Worker) | The signed XML has been transmitted to DGII, and a `trackId` has been successfully returned and recorded. |
| `accepted` | Server (Worker) | DGII has processed the track ID and returned status `ACE` (Aceptado). This is the terminal success state. |
| `rejected` | Server (Worker) | DGII has rejected the document (status `RJZ` or similar). The document is marked rejected, but the invoice payment state remains unaffected. |
| `retryable_error`| Server (Worker) | Submission or polling failed due to a temporary network issue or DGII timeout. The job is scheduled for retry with exponential backoff. |
| `terminal_error` | Server (Worker) | The job failed due to non-retryable issues (e.g., certificate expired, tenant mismatch, or structural error). |

---

## 2. Offline Checkout and localFirst Behavior

When a device is offline, the POS client remains fully operational:
1. **Fiscal Engine Resolution**: The POS queries the cached certificate metadata. If a valid certificate ID is present in `localStorage`, the engine activates `dgii_ecf` mode.
2. **Local Intent Persistence**: The engine generates the appropriate sequence (`E31` for corporate tax credit, `E32` for final consumer) and enqueues:
   - An `ecf_documents` record with status `pending_sync`.
   - A `fiscal_outbox` record with status `queued`.
3. **Receipt Presentation**: The printer templates render a pending indicator. The invoice is **not** displayed as "Accepted" because server confirmation is required.

---

## 3. Reconnect Synchronization

Once the POS client establishes an active internet connection:
1. The `sync_outbox` replicates local writes to the server.
2. The `ecf_documents` and `fiscal_outbox` records are inserted into the central Postgres database.
3. The server-side fiscal worker claims the `queued` outbox jobs via a transaction using `FOR UPDATE OF SKIP LOCKED`.

---

## 4. Idempotency and Duplication Safeguards

To prevent double-submissions and duplicate invoices in the event of network dropouts or worker restarts:
- **Deterministic XML Hashing**: Before submitting, the signed XML payload is hashed (`sha256`). This hash is saved to `ecf_documents.xml_hash`.
- **DGII Idempotency Keys**: Every submission request to DGII includes a stable idempotency key formatted as `{tenantId}:{facturaId}:submit`. If a network crash happens after DGII receives the document but before the worker records the track ID, the subsequent retry uses the exact same key.
- **Outbox State Lock**: The database repository enforces that any job whose document status is already `submitted`, `accepted`, or `rejected` is skipped instantly (`already_done`), preventing duplicate DGII API calls.
