# Local SQLite C1 Manual Validation

1. Start the desktop app offline with a validated tenant session and confirm no production sync or tenant activation is started.
2. In a disposable local profile, activate the tenant through the existing authorized session flow, then create and edit a branch, customer, supplier, category, product, inventory product, and recipe.
3. Restart the app offline and verify the same tenant's catalog records remain available locally; verify a second tenant cannot read them.
4. Attempt a recipe with an unknown product or inventory product and confirm it is rejected with no catalog row or outbox entry created.
5. Inspect the local tenant database only in the disposable profile: each successful C1 mutation has one `pending` outbox row; no sync transport is started.
6. Disable or quarantine the local C1 database to roll back. Keep IndexedDB untouched and read-only for export or recovery.

## Activation Steps Not Performed

No cloud synchronization, backend schema/data changes, production tenant activation, business cutover, pilot, or legacy IndexedDB deletion is part of C1 local validation.
