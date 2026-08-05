# Task 1 Review: Invoice Creation and Payment Gate

## Spec Compliance Verdict: FAIL

The happy-path workflow is substantially implemented: new client requests and their single `2000` unpaid invoices are created in one transaction; the required status sequence, payment evidence, administrator confirmation, optional active-Staff assignment, role checks, client invoice ownership check, and named audit actions are present. The full suite passes (18/18). However, the binding duplicate-action and audit requirements are not reliable under concurrent calls, and the tenant check does not cover both records being mutated.

### [P1] Duplicate-action/state guards are outside the transaction and successful writes are never verified

In all four transition methods, the current state is read before `BEGIN IMMEDIATE` (`server/portal.mjs:157-166`, `185-189`, `206-210`, and `227-235`). The subsequent conditional `UPDATE`s ignore their `.changes` result (`168-172`, `191-195`, `212-216`, and `237-239`). Two server instances can therefore both pass the stale pre-check. After the first commits, the second can update zero rows, still insert a success audit event, commit, and return the other action's final row. A concurrent confirmation and rejection can likewise report/audit the losing action even though it never occurred. This violates the required duplicate-action checks and makes the transition audit log untruthful.

Acquire the write lock before reading the state, or treat each guarded update as a compare-and-set whose result must be exactly one row. Roll back unless both linked updates succeed before writing the audit event.

### [P2] Payment submission authorizes only the invoice tenant, not the linked request tenant

`submitPayment` selects `i.*` and only the request status, then compares `invoice.organization_id` to the client (`server/portal.mjs:157-164`). It updates the linked request without selecting or validating `r.organization_id` (`170-171`). The schema has independent organization columns on invoices and requests but no constraint requiring them to match. A malformed or legacy cross-linked invoice would let its owning client move another tenant's request. Because server-side tenant checks are binding, the joined request organization must also equal the session organization (and ideally equal the invoice organization) in the authorization predicate.

### [P2] Required authorization and transition checks are not covered directly by the payment tests

`tests/payment-approval.test.mjs` verifies cross-tenant client submission and sequential duplicate calls, but it never attempts `rejectPayment`, `confirmPayment`, or `approvePaidRequest` with a Client or Staff token. It also omits blank rejection reasons, invalid/inactive Staff assignment, resubmission after rejection, and the losing side of confirm-versus-reject state checks. The implementation contains guards for most of these cases, but the task required strict TDD for role, tenant, state, and duplicate-action checks; the current suite does not demonstrate that coverage.

## Code Quality Verdict: FAIL

The implementation is readable and keeps each normal transition and its audit in one explicit transaction. The schema has a one-to-one invoice index and useful payment evidence columns. The concurrency correctness issue is release-blocking for a payment approval boundary, and the audit test has an identity-collision false positive.

### [P1] Transition transactions can commit no-op writes with success audit records

The same unchecked conditional updates described above are a transactional integrity defect, not merely missing test coverage. The code should centralize paired request/invoice transitions, verify affected-row counts, and only audit after the transition has been proven to occur. This would also reduce four near-duplicate transaction blocks that currently make it easy for their invariants to drift.

### [P2] Audit assertions pass because request and invoice IDs happen to collide

At `tests/payment-approval.test.mjs:101-104`, the query filters every audit row by `entity_id = request.id`, then expects `payment.submitted` and `payment.confirmed`. Those events are actually written with `entity_type='invoice'` and `entity_id=invoice.id` (`server/portal.mjs:172` and `216`). In a fresh fixture both tables start at ID 1, so the test passes accidentally. Query by both `entity_type` and the correct entity ID, assert actor/outcome/detail where relevant, and independently verify all five required actions, including rejection and invoice generation.

## Verification

- Reviewed the current files directly because Git metadata is unavailable.
- Ran `npm test` on 2026-08-04: 18 passed, 0 failed, 0 skipped/cancelled/todo.
- No source files were modified by this review.
