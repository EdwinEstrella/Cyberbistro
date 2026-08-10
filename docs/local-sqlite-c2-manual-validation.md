# Local SQLite C2 Manual Validation

1. Use a disposable, validated tenant profile while offline. Do not activate a tenant, start cloud sync, or change a production backend.
2. Confirm a branch, product, and table exist locally. Open one operational cycle and verify a second open-cycle request for the same branch is rejected.
3. From Camarera, send an order with a kitchen item. Verify the table becomes occupied, one `comandas` row, its `consumos` rows, kitchen production row, and pending local outbox operation are committed together.
4. In Cocina, move the order only through pending → preparing → ready → delivered. Confirm an attempted skipped transition is rejected without changing any local row.
5. Restart the disposable app after marking an outbox operation as syncing through the recovery test harness. Confirm recovery returns it to pending; do not run sync transport.
6. Confirm there is no configured or discovered kitchen-PC endpoint and no network request is made. Printer-routed/local operation may continue.
7. To roll back C2, disable or quarantine only the tenant SQLite C2 data and use the unchanged legacy paths for read-only rollback/export. Keep IndexedDB untouched and read-only.

## Activation Steps Not Performed

No production backend schema/data changes, tenant activation, sync transport binding, LAN kitchen delivery, sales/fiscal/purchase migration, business cutover, pilot, or IndexedDB deletion is part of C2 validation.
