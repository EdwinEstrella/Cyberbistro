# Payment Alerts Specification

## Purpose

Admin-configured payment day per tenant with date-aware modal reminders in the POS layout.

## Requirements

### Requirement: Payment Day Column

`tenants` MUST have a `payment_day_of_month SMALLINT` column with `CHECK (value BETWEEN 1 AND 31)`, nullable, default `NULL` (no alerts configured).

#### Scenario: Valid value accepted

- GIVEN a super-admin sets `payment_day_of_month` to 15
- WHEN the row is saved
- THEN the value 15 MUST persist

#### Scenario: Out-of-range value rejected

- GIVEN a value of 0 or 32
- WHEN an INSERT or UPDATE is attempted
- THEN the CHECK constraint MUST reject with a constraint violation error

### Requirement: Clamp-to-Month-End Logic

The effective payment date MUST be computed as `MIN(payment_day_of_month, last_day_of_current_month)`.

#### Scenario: Day 31 in a 30-day month

- GIVEN `payment_day_of_month = 31` and the current month has 30 days (e.g. April)
- WHEN the effective date is computed
- THEN it MUST resolve to day 30

#### Scenario: Day 29+ in February non-leap year

- GIVEN `payment_day_of_month = 31` and the current month is February in a non-leap year
- WHEN the effective date is computed
- THEN it MUST resolve to day 28

### Requirement: Payment Alert Modal

`AppLayout` MUST show an `AlertModal` (variant `"info"`, Spanish copy) when today is 1 day before OR on the effective payment date.

#### Scenario: Reminder one day before

- GIVEN today equals effective payment date minus 1
- WHEN `AppLayout` renders
- THEN an `AlertModal` with a reminder message MUST appear

#### Scenario: On payment day

- GIVEN today equals the effective payment date
- WHEN `AppLayout` renders
- THEN an `AlertModal` with a "today is payment day" message MUST appear

#### Scenario: No payment day configured

- GIVEN `payment_day_of_month` is NULL
- WHEN `AppLayout` renders
- THEN no payment alert MUST be shown

### Requirement: Alert Dismiss Persistence

Dismissing the alert MUST set a `localStorage` key `payment-alert-{YYYY-MM-DD}` scoped to the effective date. The alert MUST NOT reappear until the next full page load where the key is absent or for a different date.

#### Scenario: Dismiss persists for calendar day

- GIVEN the user dismisses the alert
- WHEN the app reloads on the same calendar day
- THEN the alert MUST NOT reappear

#### Scenario: Reappears next relevant day

- GIVEN the user dismissed the alert yesterday
- WHEN the app loads today and today is still within the alert window
- THEN the alert MUST appear (different date key)

### Requirement: LocalFirst Sync of Payment Day

`payment_day_of_month` MUST sync through the existing `tenants` local-first mirror so offline clients display correct alerts.

#### Scenario: Field syncs to IndexedDB

- GIVEN the server row includes `payment_day_of_month`
- WHEN the local-first pull executes for the `tenants` table
- THEN the value MUST be stored in the `tenants` IndexedDB object store
