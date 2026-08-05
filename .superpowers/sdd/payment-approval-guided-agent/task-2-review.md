# Task 2 Review: Commercial API and Role Queries

## Spec Compliance Verdict: FAIL

The required five routes exist, use `amy_session` as their only session-token source, validate positive safe-integer identifiers, require a non-blank rejection reason, and delegate role/state decisions to the portal service. Normal authorization failures are reduced to generic `400`, `401`, or `403` JSON responses. The payment gate is enforced by requiring both a paid invoice and `pending_admin_approval` request before approval. Administrator, Client, and Staff dashboard rows expose the requested commercial aliases, and the ordinary role-scoping tests pass.

The implementation is not spec-compliant overall because malformed JSON leaks server internals, Client invoice reads do not preserve the linked-record tenant invariant already enforced by payment mutations, and the Administrator collection does not include all Staff records.

### [P1] Malformed JSON bypasses the safe error contract and exposes a stack trace

`express.json()` is registered before the route-level `handler` wrapper (`server/index.mjs:39`), but the application has no terminal JSON error middleware. A malformed JSON body therefore never reaches `safeError` (`server/index.mjs:16-31`); Express's development error handler returns an HTML `400` containing the parse exception and absolute `node_modules` paths.

An isolated request to `POST /api/invoices/1/reject` with body `{` returned `400 text/html` and a response containing `SyntaxError`, the JSON parse location, and `C:\Users\AMY\Desktop\MY_MAILS\ai-business-automation-portal\node_modules\body-parser\...`. This directly violates the requirement that invalid requests return safe responses without leaking internals. Add final error middleware that maps body-parser syntax/size errors to the same generic JSON error envelope and does not serialize stack/message details.

### [P2] Client invoice reads do not validate the linked request tenant

`listInvoices` filters only `i.organization_id` and `getInvoice` authorizes only `invoice.organization_id` (`server/portal.mjs:314-330`). The schema independently stores invoice and request organization IDs and has no constraint requiring them to match (`server/database.mjs:78-92`). Task 1 correctly hardened payment mutations by joining and validating both tenant IDs, but Task 2's read paths omit that invariant.

An isolated probe created an invoice for organization B, changed only `invoices.organization_id` to organization A (a schema-valid state), and then authenticated as A. Both `listInvoices` and `getInvoice` returned the row, including B's request-derived description. This is a cross-tenant disclosure under malformed or legacy data and violates the binding Client isolation requirement. Join `service_requests` in both Client invoice queries and require the session organization to match the invoice organization, request organization, and their equality.

### [P2] Administrator dashboard omits inactive Staff records

The brief requires Administrator data to include all Staff, while Client data needs agent availability. Both collections currently use `listActiveStaff`, whose query filters `u.status='active'` (`server/portal.mjs:65-66`, `159-160`). Consequently, an inactive Staff member is absent from `staffMembers`, although `metrics.staff` counts that same row because the metric has no status filter (`server/portal.mjs:157`).

An isolated probe produced `metrics.staff === 1` and `staffMembers.length === 0` after deactivating the only Staff user. Keep the active filter for Client `agentAvailability`, but provide Administrators a complete Staff query, including status so later views can distinguish inactive records.

## Code Quality Verdict: FAIL

The portal methods are readable, use parameterized SQL, retain Task 1's lock-before-read transactions and checked state-changing updates, and expose view aliases without removing the legacy database-shaped fields. The transport error boundary and duplicated scoping assumptions are nevertheless unsafe for a commercial API. The tests cover the requested happy paths but miss the cases that expose all three spec defects.

### [P1] The error boundary covers route actions but not request parsing

The `handler` helper centralizes portal exceptions, but it is not an application-level error boundary. Errors from `express.json`, future middleware, and static handling bypass it. This split makes the report's claim that the HTTP mapper always emits generic responses false and leaves security behavior dependent on Express environment defaults. Add one terminal error middleware and use explicit typed/status errors rather than classifying arbitrary message text with `/authorized|assigned|permitted/` (`server/index.mjs:16-20`).

### [P2] Security/scoping tests omit malformed transport and inconsistent-record cases

The API security test checks a query-string token, an invalid path ID, and a blank reason (`tests/api.test.mjs:166-182`), but it does not send malformed JSON or assert a JSON content type/body with no internal details. The dashboard test creates two healthy tenants and only checks collection lengths (`tests/api.test.mjs:184-239`); it never exercises an invoice/request tenant mismatch or inactive Staff visibility. Add direct regressions for the three findings above, including both `GET /api/invoices/:id` and the dashboard invoice list.

### [P3] The dashboard test hard-codes a database-generated Staff ID

The test creates Staff through the API but discards the returned ID, then approves with `staffId: 4` (`tests/api.test.mjs:189-204`). This only works because the clean fixture currently seeds one Administrator and creates two Clients before the Staff user. Any additional seed user or setup-order change breaks the test for an unrelated reason. Parse the Staff creation response and use its `id`.

## Verification

- Reviewed `task-2-brief.md`, `task-2-report.md`, `server/index.mjs`, `server/portal.mjs`, `server/database.mjs`, `tests/api.test.mjs`, `tests/security-domain.test.mjs`, and `tests/payment-approval.test.mjs` directly.
- Fresh isolated test runs passed: API 9/9, payment approval 10/10, security domain 4/4, and the remaining project tests 8/8 (31/31 in aggregate, zero observed failures).
- The exact focused multi-file command and `npm test` were also attempted, but this command environment ended each process after roughly 30 seconds before a final TAP summary, so this review does not claim a fresh successful exit for either combined invocation.
- Reproduction probes confirmed the malformed-JSON disclosure, cross-tenant invoice visibility, and inactive-Staff omission described above.
- No application source or test files were modified by this review.
