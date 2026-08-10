# Secure LAN Replication Specification

## Purpose

Prevent LAN traffic from becoming an unauthenticated cross-tenant channel or a replacement for local SQLite while allowing configured kitchen delivery during cloud outages.

## Requirements

### Requirement: Authorized Tenant-Bound LAN Traffic

LAN replication MUST be disabled until tenant authorization, authenticated reads and writes, tenant partitioning, and protected transport are available. When enabled, every request MUST bind to the authorized tenant and reject foreign or unauthenticated event access; shared plaintext event logs and wildcard access MUST NOT be trusted replication paths. LAN traffic MAY replicate or recover SQLite state but MUST NOT be the normal runtime source for any module.

#### Scenario: Disabled unsafe path

- GIVEN LAN authorization is not deployed
- WHEN a device requests or submits replication events
- THEN the request is rejected
- AND no event payload is returned or persisted

#### Scenario: Authorized replication

- GIVEN a device has valid authorization for tenant A
- WHEN it exchanges events
- THEN only tenant-A events are accepted and returned
- AND tenant-B requests are rejected

#### Scenario: Local source remains authoritative

- GIVEN LAN replication is enabled for tenant A
- WHEN a supported module reads or writes tenant data
- THEN it uses tenant-A SQLite and its local outbox
- AND LAN data is processed only as an authenticated replication or recovery input

### Requirement: Configured Offline Kitchen Delivery

When cloud or homelab is unavailable, the system MUST attempt direct LAN delivery of a kitchen order only if tenant configuration explicitly identifies a separate kitchen endpoint. The local tenant-bound kitchen queue MUST retain each order until that endpoint acknowledges it, retry while it is unavailable, and expose clear operator status. Sales and kitchen printer assignments indicate intentional single-device or printer-routed operation; without an explicit separate endpoint, the system MUST NOT discover, probe, or contact a kitchen PC. Direct LAN delivery MUST authenticate and bind both parties to the same tenant, and MUST complement rather than replace cloud synchronization.

#### Scenario: Configured endpoint receives an offline order

- GIVEN cloud or homelab is unavailable and tenant A configures a separate authenticated kitchen endpoint
- WHEN a tenant-A kitchen order commits locally
- THEN the order is queued locally and direct delivery is attempted to that endpoint
- AND acknowledged delivery is recorded without treating cloud synchronization as complete

#### Scenario: Endpoint is unavailable

- GIVEN a queued tenant-A kitchen order and its configured endpoint does not acknowledge delivery
- WHEN a delivery attempt fails or times out
- THEN the order remains durable and retryable in the local queue
- AND the operator sees the pending kitchen-delivery status

#### Scenario: Printer-routed installation has no endpoint

- GIVEN sales and kitchen printer assignments exist but no separate kitchen endpoint is configured
- WHEN a kitchen order commits while cloud or homelab is unavailable
- THEN the system does not discover or probe a kitchen PC
- AND normal local and printer-routed operation continues

#### Scenario: Foreign endpoint rejection

- GIVEN a configured endpoint presents invalid authentication or a tenant-B identity for tenant A
- WHEN tenant A attempts direct kitchen delivery
- THEN the endpoint receives no order payload
- AND the order remains queued with an operator-visible failure status
