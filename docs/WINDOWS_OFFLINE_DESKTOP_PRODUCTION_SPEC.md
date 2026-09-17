# MitrixoGYM Windows Offline Desktop — Production Specification

**Status:** Architecture approved for phased implementation  
**Products:** Strike Desktop and Inzan Athletics Desktop  
**Principle:** Two independently branded and signed Windows products built from one shared codebase. Firestore remains authoritative; encrypted SQLite is an offline working set, never a second source of truth.

## 1. Product goals

The desktop applications must keep reception operational during internet or web-server outages without weakening tenant isolation or financial correctness.

The first production release supports:

- Local member lookup and membership visibility.
- Offline attendance/check-in capture.
- Durable queuing and automatic synchronization.
- Clear `Offline`, `Pending`, `Synced`, `Conflict`, and `Failed` states.
- Device registration, revocation, auditability, safe updates, and recovery after interruption.

The first release does **not** finalize card payments, refunds, membership cancellations, session-balance changes, or other financially sensitive operations while offline.

## 2. Technology baseline

- Runtime: **.NET 10 LTS** and current supported C# version.
- UI: WinUI 3 on the current stable Windows App SDK.
- Architecture: MVVM using `CommunityToolkit.Mvvm`.
- Local database: SQLite in WAL mode through `Microsoft.Data.Sqlite.Core` and a reviewed SQLCipher-compatible native bundle.
- Distribution: signed MSIX/App Installer packages with controlled update channels. Unpackaged single-file publishing may be used for development tools, not as the default production distribution.
- Reporting/import: ClosedXML only in features that require Excel interoperability.

Package versions must be centrally pinned, restored through lock files, patched routinely, and validated in CI. Do not remove runtime binaries with filename-based publish rules.

## 3. Product and tenant boundaries

| Product | Compiled tenant | Authoritative database | Local database | Update channel |
|---|---|---|---|---|
| Strike Desktop | `strike` | Firestore `(default)` | Dedicated encrypted Strike DB | Strike |
| Inzan Athletics Desktop | `inzanathletics` | Firestore `db-inzanathletics` | Dedicated encrypted Inzan DB | Inzan |

Each product has its own name, icon, package identity, signing configuration, device registration, local encryption key, telemetry scope, and updater feed.

The tenant value compiled into the client is a presentation/build constraint, not authorization. The sync service resolves the tenant from the authenticated device registration and rejects any tenant supplied by the client that does not match it. A token registered for Strike can never address Inzan's Firestore database, and vice versa.

No shared production code may contain a fallback that silently changes tenants. Server access must derive the database through the existing tenant-aware mechanism equivalent to `getDbForRequest(req)`.

## 4. System architecture

```text
Strike Desktop / Inzan Desktop
  ├─ WinUI views and view models
  ├─ Domain/application services
  ├─ Encrypted SQLite working set
  ├─ Transactional outbox and inbox
  ├─ Sync coordinator
  └─ Device identity and secure token store
                │ HTTPS + authenticated device/user context
                ▼
Tenant-aware Sync API
  ├─ Authentication and authorization
  ├─ Device registration/revocation
  ├─ Idempotency ledger
  ├─ Validation and conflict policy
  ├─ Append-only audit records
  └─ Cursor-based change feed
                │
                ▼
Tenant Firestore database (authoritative)
```

The desktop client does not use Firebase Admin credentials and never contains service-account secrets. Privileged changes pass through authenticated server endpoints. Direct client Firestore access is not part of the desktop sync protocol.

## 5. Local data model

Every synchronized business row includes:

- `id`: stable server record ID.
- `tenant_id`: defense-in-depth tenant marker.
- `server_version`: monotonic version or opaque revision assigned by the server.
- `server_updated_at`: server timestamp for display and diagnostics, not conflict ordering by itself.
- `deleted_at`: nullable tombstone timestamp.
- `sync_state`: `synced`, `pending`, `conflict`, or `failed`.

Required infrastructure tables:

### `outbox_operations`

- `operation_id` — client-generated UUID/ULID and idempotency key.
- `tenant_id`, `device_id`, `actor_user_id`.
- `entity_type`, `entity_id`, `operation_type`.
- `base_server_version`.
- `payload_json` and `schema_version`.
- `created_at_utc`, `attempt_count`, `next_attempt_at_utc`.
- `status`, `last_error_code`, and safe diagnostic message.

The business mutation and its outbox entry must be committed in the same SQLite transaction.

### `inbox_receipts`

Stores applied server event IDs so pull retries cannot apply a change twice.

### `sync_state`

Stores the last committed opaque cursor, last successful sync time, current backoff, and last error. The cursor advances only after the entire downloaded page has been committed locally.

### `conflicts`

Stores the local intent, current server representation, reason code, and resolution state. Conflicts must be visible to authorized staff and must never disappear silently.

### `device_state`

Contains non-secret device metadata and registration state. Refresh tokens and database-key material belong in Windows Credential Manager/DPAPI-protected storage, not ordinary SQLite columns.

## 6. Synchronization protocol

Synchronization is explicit push-then-pull and safe to repeat.

1. Confirm connectivity and refresh authentication.
2. Push a bounded batch of pending outbox operations.
3. Server authenticates user and device and derives the tenant.
4. Server checks the idempotency ledger by `operation_id`.
5. Server validates permissions, schema, invariants, and `base_server_version`.
6. Server applies accepted operations atomically where the domain requires it and records the result/audit event.
7. Client marks only acknowledged operations as complete.
8. Client pulls a bounded page of changes after its opaque cursor.
9. Client applies the page and inbox receipts in one SQLite transaction.
10. Client advances the cursor only after that transaction commits.
11. Repeat until caught up; use exponential backoff with jitter after transient failures.

API responses return stable machine-readable error codes and correlation IDs. Authentication and authorization failures are not retried indefinitely. Invalid payloads enter a visible failed state. Network failures remain pending.

Suggested endpoints:

- `POST /api/desktop/devices/register`
- `POST /api/desktop/devices/refresh`
- `POST /api/desktop/sync/push`
- `GET /api/desktop/sync/pull?cursor=...&limit=...`
- `POST /api/desktop/conflicts/{id}/resolve`
- `POST /api/desktop/devices/{id}/revoke`

All write routes require authentication. Rate limits, payload limits, audit logging, request validation, and tenant-scoped Firestore access are mandatory.

## 7. Conflict and domain rules

Do not apply a universal last-write-wins rule.

| Domain | Offline policy | Conflict policy |
|---|---|---|
| Attendance/check-in | Allowed | Append; deduplicate by operation ID and domain uniqueness rule |
| Notes | Allowed if non-sensitive | Append; never overwrite another note |
| Member contact details | Optional after phase 1 | Version check; staff resolves concurrent edits |
| Membership/package status | Read-only offline initially | Server wins; reject offline mutation |
| Session balances/bookings | Read-only offline initially | Server-authoritative transactional validation |
| Cash receipt | Later phase, pending only | Unique receipt ID; server reconciles and confirms |
| Card payment/refund | Online only | Provider and server response required |
| Deletion | Restricted | Versioned tombstone; no physical delete during sync |
| Roles/permissions/settings | Online only | Server-authoritative |

Device clocks are not trusted for ordering or expiry decisions. The server assigns authoritative timestamps and versions.

## 8. Payments and financial safety

- Never store card numbers, CVVs, magnetic-stripe data, payment-provider secrets, or service credentials locally.
- An offline card payment cannot be represented as successful.
- Offline cash collection, when later implemented, creates a `pending_reconciliation` receipt with a globally unique ID, cashier, device, amount, currency, and local creation time.
- Sync processing must be idempotent so retries cannot create duplicate payments or receipts.
- Financial totals shown offline must be labeled with their data freshness.
- Refunds, reversals, entitlement grants, and membership activation require an online server transaction.
- Every accepted or rejected financial operation creates an immutable audit event.

## 9. Security controls

- TLS for all network traffic; reject invalid certificates.
- Short-lived access tokens and securely stored refresh/device credentials.
- Encrypted local database using a maintained SQLCipher-compatible provider.
- Per-installation database key generated locally and protected by DPAPI/Credential Manager.
- Role and permission checks repeated server-side for every mutation.
- Device inventory with registration date, last seen, app version, user assignment, and revocation.
- Automatic local lock after inactivity and explicit logout/lock action.
- Redacted structured logs; no tokens, secrets, full payment payloads, or unnecessary member PII.
- Signed production packages and signed update manifests.
- Dependency and secret scanning in CI.
- Minimum supported app version so compromised or incompatible builds can be blocked.
- Documented lost/stolen-device procedure: revoke device, invalidate credentials, investigate sync/audit history, and rotate affected secrets.

Local data retention must be minimized. Cache only fields and records required for reception work, expire stale nonessential records, and provide an authenticated secure wipe/re-provision flow.

## 10. SQLite correctness and recovery

At database initialization:

- Enable WAL mode and foreign keys.
- Set and verify an appropriate busy timeout.
- Use explicit transactions for domain writes and outbox creation.
- Allow one controlled writer path; avoid unrestricted concurrent connections.
- Implement numbered, transactional, forward-only schema migrations.
- Back up the encrypted DB before a risky migration and retain only a bounded number of backups.
- Run integrity checks after abnormal termination or migration failure.
- Checkpoint WAL intentionally; backups must include the database state correctly and must not copy only the main file while writes are active.

The application must recover safely from power loss at every sync boundary. An interrupted push is retried with the same operation ID; an interrupted pull is replayed because its cursor was not committed.

## 11. Authentication and offline authorization

First login and device registration require connectivity. After successful provisioning, an authorized user may unlock an offline session for a bounded policy-controlled period.

- Cache only the minimum authorization snapshot needed for supported offline actions.
- Record the user identity on every local mutation.
- When the offline authorization window expires, switch to read-only or locked mode.
- A role change or device revocation takes effect on the next contact and may require local data wipe.
- High-risk functions always require fresh online authorization.
- Shared reception workstations must support fast user lock/switch without mixing audit identities.

## 12. User experience requirements

The shell must always display:

- Connectivity state.
- Last successful synchronization time.
- Pending, failed, and conflicting operation counts.
- Data freshness where it matters.
- A manual `Sync now` action.
- Actionable error details without exposing secrets.

Saving offline must say `Saved on this device — pending sync`, never `Saved to cloud`. Closing the application with pending work must not discard it. Accessibility, keyboard navigation, Arabic/English layout behavior, and representative low-resolution reception monitors must be tested.

## 13. Updates and deployment

- Produce independent signed Strike and Inzan packages from the same commit.
- Use development, staging, pilot, and production channels.
- Roll out to pilot devices before broad production deployment.
- Apply database migrations before enabling features that require them.
- Prevent downgrade when it would make the local schema unreadable.
- Preserve queued operations during compatible updates.
- Maintain a rollback/runbook strategy; never roll back through a destructive data migration.
- The app must remain usable offline if update checks fail.

MSIX/App Installer is preferred for clean install/uninstall and managed updates. If deployment constraints force an unpackaged build, explicitly document lost capabilities and provide a signed installer, updater, and complete runtime deployment plan.

## 14. Observability and operations

Client telemetry, once connectivity returns, includes:

- App, schema, OS, and device versions.
- Startup and local-query latency.
- Sync duration, batch size, retry count, queue age, and failure codes.
- Conflict count, migration result, and crash correlation ID.
- No unnecessary PII.

Server dashboards and alerts cover:

- Sync API availability and latency.
- Error rate by version and tenant without exposing cross-tenant data.
- Oldest pending-operation age.
- Idempotency conflicts and rejected mutations.
- Firestore latency/quota errors.
- Payment reconciliation failures.

Provide runbooks for server outage, Firestore degradation, stuck device queue, corrupted local DB, revoked device, failed migration, bad release, and reconciliation discrepancies.

## 15. Test strategy

Automated tests must cover:

- Domain rules and validation.
- SQLite migrations from every supported production version.
- Transactional outbox behavior.
- Duplicate push and duplicate pull delivery.
- Conflict policy per entity type.
- Tenant mismatch and cross-tenant attack attempts.
- Token expiry, role change, and revoked devices.
- Interrupted writes, process termination, and restart recovery.
- Pagination/cursor correctness with concurrent server changes.
- Payment idempotency and forbidden offline financial actions.
- Arabic/English localization and accessibility-critical flows.

Integration tests use isolated emulator/test databases for both tenants. Never test destructive behavior against production.

Release testing includes deliberate internet loss before, during, and after writes; prolonged offline use; reconnect storms; slow/flapping networks; duplicate delivery; clock skew; disk-full behavior; database corruption simulation; update with queued work; and multi-device concurrent edits.

## 16. CI/CD quality gates

Every pull request must:

- Restore locked dependencies.
- Compile with nullable reference types enabled and warnings treated according to the agreed policy.
- Pass unit, integration, migration, security, and tenant-isolation tests.
- Produce both branded artifacts from the same shared-core revision.
- Scan dependencies and secrets.
- Generate a software bill of materials.

Production artifacts must be reproducible, signed, versioned, retained, and promoted rather than rebuilt between staging and production.

## 17. Phased delivery

### Phase 0 — Proof of architecture

- Shared solution and two branded shells.
- Encrypted SQLite, migrations, secure device identity, and staging sync API.
- Automated tenant-isolation and crash-recovery tests.

### Phase 1 — Reception resilience

- Member working-set download.
- Offline member search and membership display.
- Offline check-ins through the transactional outbox.
- Sync-status UI, audit trail, retries, and device revocation.

### Phase 2 — Safe operational writes

- Notes and enquiries.
- Explicit conflict dashboard and resolution.
- Expanded monitoring and fleet management.

### Phase 3 — Cash reconciliation

- Pending offline cash receipts with server confirmation.
- Shift reconciliation, discrepancy handling, and reports.

### Phase 4 — Carefully selected additional workflows

Add only workflows whose invariants, conflict rules, authorization behavior, and recovery tests are fully defined. Card payments remain online-authoritative.

## 18. Phase 1 production acceptance gates

Phase 1 is production-ready only when all of the following are demonstrated:

- Strike can never read or write Inzan data, and Inzan can never read or write Strike data.
- Ten thousand repeated deliveries of the same operation create exactly one server-side effect.
- Killing the app at every documented sync step loses no acknowledged local operation.
- A revoked device is denied at the next connection and handled according to the secure-wipe policy.
- Seven days offline does not lose check-ins or make the UI unusable.
- A reconnect storm from the pilot fleet does not overload the sync service.
- Updates preserve queued operations and local database integrity.
- Corrupted/missing credentials and a corrupted DB fail closed with a documented recovery path.
- Support staff can identify a failed operation from a correlation ID without accessing another tenant.
- Signed pilot packages pass real-device testing at one Strike and one Inzan reception workstation.
- Backup, recovery, incident, and rollback runbooks have been exercised.

## 19. Explicit non-goals

- A full offline clone of every Firestore collection.
- Direct Firebase Admin access from desktop clients.
- Guaranteed startup/RAM/latency marketing numbers without measured evidence.
- Using `UnhandledException` as a substitute for transactional correctness.
- Universal last-write-wins conflict handling.
- Offline confirmation of card payments or refunds.
- Separate duplicated implementations for Strike and Inzan.

## 20. Authoritative implementation references

- [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy)
- [Windows application packaging overview](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/packaging/)
- [Windows App SDK deployment options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/)
- [WinUI startup performance guidance](https://learn.microsoft.com/en-us/windows/apps/develop/performance/app-startup-performance)
- [Microsoft.Data.Sqlite encryption guidance](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/encryption)

These references guide framework and deployment choices. MitrixoGYM tenant isolation, payment rules, and synchronization invariants in this specification remain mandatory even if implementation libraries change.
