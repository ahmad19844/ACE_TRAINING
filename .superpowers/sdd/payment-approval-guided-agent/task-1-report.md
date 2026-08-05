# Task 1 Report: Invoice Creation and Payment Gate

## Delivered

- Added a one-to-one `invoices.service_request_id` relationship and payment evidence fields: reference, submission timestamp, rejection reason, confirmation timestamp, and confirming administrator.
- New databases default service requests to `awaiting_payment` and invoices to `unpaid`. Existing databases receive the newly required invoice columns and unique index on the request link without destructive schema changes.
- `createServiceRequest` now creates the request and exactly one linked invoice in one `BEGIN IMMEDIATE` transaction. The invoice amount is the required `2000`; its initial state is `unpaid`.
- Added payment-gated portal operations:
  - `submitPayment(token, invoiceId)` records a `PAY-...` reference and submission time, then moves the request to `payment_pending_confirmation`.
  - `rejectPayment(token, invoiceId, reason)` requires a non-blank reason, returns the invoice to `unpaid`, and returns the request to `awaiting_payment`.
  - `confirmPayment(token, invoiceId)` records the confirming Administrator and time, marks the invoice `paid`, and moves the request to `pending_admin_approval`.
  - `approvePaidRequest(token, requestId, staffId?)` permits approval only from `pending_admin_approval` with its linked paid invoice; an optional active Staff member may be assigned.
- Each action is role/state guarded. Client payment submission also validates organization ownership; Admin actions require an active administrator who has changed the seeded password.
- Added audit records for invoice generation, payment submission, rejection, confirmation, and final request approval.
- Updated the superseded workflow test to exercise the payment gate rather than the removed pre-payment handoff sequence.

## Test-driven development record

1. Added `tests/payment-approval.test.mjs` and changed the legacy workflow expectation first.
2. Ran `node --test --test-concurrency=1 tests/payment-approval.test.mjs`; it failed as expected because requests were `submitted` and no invoice or payment methods existed.
3. Implemented the smallest database and portal changes to meet those observable contracts.
4. Ran the focused tests again; all seven focused/payment workflow tests passed.
5. Completed a requirement self-review against `task-1-brief.md`, including statuses, exact amount, linking, authorization, duplicate/state rejection, and audit calls.
6. Ran the full suite fresh with `npm test`.

## Verification

`npm test` completed successfully on 2026-08-04:

- 18 tests passed
- 0 failed, cancelled, skipped, or todo
- Node emitted only its existing SQLite experimental-feature warning

## Scope note

The schema migration preserves legacy rows by adding the link and payment columns non-destructively. Existing pre-feature requests and historical invoices are not retroactively linked or invoiced; the requirement applies to every **new** client service request.

## Review Round 1 Fix Report

### Root cause and remediation

- **P1 — stale state checks and unverified writes:** The four payment-gated transitions previously selected their state before acquiring the write lock and ignored conditional update results. Added `inImmediateTransaction` and `requireOneChange` helpers. Each transition now executes `BEGIN IMMEDIATE`, re-reads the linked record(s) while locked, validates their current state, checks every required update changed exactly one row, and only then writes its success audit event. Any mismatched state or no-op update throws and the helper rolls back before an audit can be written.
- **P2 — incomplete client tenant authorization:** `submitPayment` now selects the linked request organization and requires the authenticated Client organization to equal both the invoice and request organizations. Its conditional updates repeat the organization predicates. Administrator confirmation, rejection, and approval also reject inconsistent invoice/request organization links rather than changing malformed cross-tenant records.
- **P2 — missing direct coverage:** Extended `tests/payment-approval.test.mjs` with a deliberately malformed cross-tenant link, Client and Staff attempts against each Administrator action, blank rejection reason, invalid and inactive Staff assignment, resubmission after rejection, and precise audit assertions.
- **P2 — audit identity collision:** Audit assertions now query on both `entity_type` and the actual entity ID. They independently verify invoice generation, submission, rejection, confirmation, and request approval, including relevant actor, outcome, and detail fields.

### TDD evidence

Added the cross-linked tenant regression before changing production code, then ran:

```text
node --test --test-concurrency=1 tests/payment-approval.test.mjs
```

The new regression failed as expected before the fix:

```text
not ok 4 - payment submission rejects an invoice whose linked request belongs to another tenant
error: 'Missing expected exception.'
# pass 7
# fail 1
```

After the transactional and authorization changes, the same covering command produced:

```text
# tests 8
# pass 8
# fail 0
```

### Final verification

Ran:

```text
npm test
```

Output summary:

```text
# tests 21
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The only output outside TAP results was Node's existing SQLite experimental-feature warning.

## Review Round 2 Fix Report

Added two direct opposing-action regressions in `tests/payment-approval.test.mjs`:

- After confirmation, `rejectPayment` must throw; the invoice remains `paid`, the request remains `pending_admin_approval`, and no successful `payment.rejected` invoice audit exists.
- After rejection, `confirmPayment` must throw; the invoice remains `unpaid`, the request remains `awaiting_payment`, and no successful `payment.confirmed` invoice audit exists.

These assertions directly prove the expected state guard and the absence of a losing-action audit, without weakening production code.

Verification commands and output summaries:

```text
node --test --test-concurrency=1 tests/payment-approval.test.mjs
# tests 10
# pass 10
# fail 0
```

```text
npm test
# tests 23
# pass 23
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Node again emitted only its existing SQLite experimental-feature warning.
