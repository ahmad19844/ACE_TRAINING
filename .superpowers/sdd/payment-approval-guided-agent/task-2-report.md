# Task 2 Report: Commercial API and Role Queries

## Delivered

### Authenticated commercial HTTP API

Implemented the required server endpoints in `server/index.mjs`:

- `GET /api/invoices/:id`
- `POST /api/invoices/:id/pay`
- `POST /api/invoices/:id/confirm`
- `POST /api/invoices/:id/reject`
- `POST /api/requests/:id/approve`

All routes obtain their session token exclusively through the `amy_session` cookie. They delegate the stateful authorization and transition decisions to the portal service methods from Task 1 (`submitPayment`, `confirmPayment`, `rejectPayment`, and `approvePaidRequest`). `getInvoice` was added to the portal service so invoice retrieval also has a single role/tenant authorization boundary.

Route identifiers are constrained to positive safe integer strings. The optional approval `staffId` is validated with the same rule, and payment rejection requires a non-blank reason before the portal action is invoked. A query-string value cannot authenticate a request. The HTTP error mapper emits only safe generic responses:

- `401 { error: "Authentication required" }`
- `403 { error: "You are not authorized to perform this action" }`
- `400 { error: "Invalid request" }`

The mapper was tightened during testing so validation messages containing the word `required` are no longer misclassified as authentication failures.

### Role-scoped dashboard query data

Extended `getDashboard` and the query methods in `server/portal.mjs`:

- Administrator data now contains all organizations, active Staff members, service requests, invoices, support tickets, and audit events.
- Client data contains only its organization, requests, invoices, tickets, and active-agent availability; it omits audit events and other organizations' data.
- Staff data remains assignment-scoped for requests and tickets, with no organizations, invoices, or audit-event collection exposed.

The returned query rows retain existing database-shaped fields for compatibility and add view-oriented aliases. These include `clientId`, `company`, `staffId`, `staffName`, `staffEmail`, `invoiceNumber`, `paymentReference`, `paymentSubmittedAt`, `confirmedAt`, `confirmedBy`, `confirmedByName`, and audit `actorId`, `actorName`, `actorRole`, `action`, and `occurredAt` fields.

## Test-driven development record

1. Added API tests for Client payment submission and invoice retrieval, cross-organization payment denial, Administrator confirmation, rejection with reason, post-payment request approval, and pre-payment approval rejection.
2. Ran `node --test tests/api.test.mjs` before the routes existed. The Client payment test failed with `404 !== 200`, proving the missing HTTP route.
3. Added the minimal transport, portal invoice-query, safe-error, and role-query implementation.
4. Added coverage for numeric identifier validation, blank rejection reason, cookie-only authentication, and dashboard tenant/role scoping.
5. The new validation test initially failed because the previous broad `/required/` error classification produced `401` for a blank rejection reason. Narrowed the authentication mapping to exact authentication/credential failures, then reran it successfully.
6. Added concurrent isolation to independent HTTP integration tests; every test uses its own temporary database/server and the full suite confirms no shared-state leakage.

## Self-review

Reviewed the final implementation against `task-2-brief.md`:

- All five required routes are present and are registered before the static fallback.
- The opaque token is read only by `cookieToken`; no route reads a body, query, or authorization header token.
- Invoice and request IDs, including optional Staff assignment ID, reject non-numeric or unsafe values.
- Rejection reasons cannot be blank.
- Payment and approval transitions remain owned by the Task 1 portal methods, retaining their role, tenant, state, transaction, and audit protections.
- `getInvoice` denies Staff and cross-organization Client access and returns data to Administrators.
- Administrator dashboard collections are global; Client collections are organization-scoped; Staff collections are assignment-scoped.
- The dashboard exposes the required commercial, Staff identity, and audit-view fields without removing legacy field names consumed by the current UI.
- Error response bodies are generic and do not return exception, SQLite, token, or authorization-detail internals.

## Verification

Required focused command, run after the final changes:

```text
node --test tests/api.test.mjs tests/security-domain.test.mjs tests/payment-approval.test.mjs
# tests 23
# pass 23
# fail 0
```

Full suite, run after the final changes:

```text
npm test
# tests 31
# pass 31
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Node emitted its existing SQLite experimental-feature warning only. No Git commit was created (the workspace has no Git metadata).

## Review Round 1 Fixes

### Findings addressed

- **P1 — malformed JSON disclosure:** Added terminal Express error middleware after the routes and static fallback. It catches JSON-parser errors before Express can render its default HTML stack trace and responds with the safe JSON envelope. Client-caused errors retain their safe status and `{ "error": "Invalid request" }`; unexpected errors return a generic JSON `500` without exception details.
- **P2 — inconsistent linked invoice/request tenant read:** Invoice reads now join the linked `service_requests` record. Client invoice listing requires the session organization to match both organization IDs and requires invoice/request organization equality. Direct Client invoice reads apply the same three-part condition and return the existing safe authorization response if it fails. Administrator reads remain able to inspect all records, including malformed historical records.
- **P2 — Staff governance visibility:** The Administrator `staffMembers` collection now queries all Staff user records, including inactive/suspended records, and returns `status`. Client `agentAvailability` continues to query only active Staff members.
- **P3 — brittle generated Staff ID:** The dashboard integration test parses the Staff creation response and uses the returned `id`; it no longer assumes fixture user ordering or a numeric ID of `4`.

### Added regression coverage

- A malformed JSON `POST` checks `400`, JSON content type, the generic error body, and absence of stack/path terms.
- A deliberately inconsistent invoice/request organization link checks that the incorrect Client receives `403` from `GET /api/invoices/:id` and does not receive the row through dashboard invoice data.
- An inactive Staff record checks that the Administrator dashboard includes it with `status: "inactive"`, while Client agent availability omits it.

### Review-fix verification

The foreground process cap in this environment is approximately 30 seconds, so the requested commands were run in hidden background processes and their complete TAP output was polled to completion. Both commands exited with the following final summaries:

```text
node --test tests/api.test.mjs tests/security-domain.test.mjs tests/payment-approval.test.mjs
# tests 26
# pass 26
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 40659.3433
```

```text
npm test
# tests 34
# pass 34
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 44784.3167
```

The only non-TAP output was Node's existing SQLite experimental-feature warning. No Git commit was created.
