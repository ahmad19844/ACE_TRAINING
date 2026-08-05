# Task 1 Fix Round 1 Re-review

## Verdict

**NOT READY for an unqualified pass.** The two implementation defects rated P1/P2 in the prior review are addressed, as is the audit assertion identity collision. The prior test-coverage finding is **NOT ADDRESSED** in full: one named state-conflict case still has no direct regression test. No new Critical or Important implementation breakage was introduced by the fix.

## Prior findings

### [P1] Duplicate-action/state guards outside the transaction and unchecked updates — ADDRESSED

`server/portal.mjs` now wraps each payment-gated transition in `inImmediateTransaction`, which starts `BEGIN IMMEDIATE` before the invoice/request state is read. `submitPayment`, `rejectPayment`, `confirmPayment`, and `approvePaidRequest` read their linked rows inside that transaction and call `requireOneChange` on every state-changing update. If any guarded update is a no-op, the helper throws and rolls back before the success audit is written. The audit calls are after the checked writes.

This fixes both stale pre-checks and truthful-audit concerns in the prior P1 findings. The implementation does not have to depend on an added concurrency test for that correctness property: the lock is acquired before observation and SQLite serializes competing writers.

### [P2] Payment submission authorizes only the invoice tenant — ADDRESSED

`findInvoiceAndRequest` now returns `r.organization_id` as `request_organization_id`. `submitPayment` rejects unless the authenticated Client owns both the invoice and its linked request and those organization IDs match. Its two updates also retain organization predicates. The three Administrator actions similarly reject an inconsistent linked invoice/request organization pair before mutating either record.

The added malformed cross-tenant regression directly demonstrates the Client case and keeps both records unchanged after rejection.

### [P2] Required authorization and transition checks not directly covered — NOT ADDRESSED

The fix adds direct coverage for Client and Staff denial on all three Administrator actions, blank rejection reason, invalid and inactive Staff assignment, resubmission after rejection, and the malformed cross-tenant submission. Those portions are now covered.

However, the prior finding also identified the losing side of a **confirm-versus-reject** state conflict. `tests/payment-approval.test.mjs` still does not call `rejectPayment` after a successful confirmation (nor `confirmPayment` after a successful rejection) and assert rejection plus unchanged final state. The code's guarded state checks appear to enforce it, but the required strict TDD evidence is still absent. Therefore this prior finding cannot be marked addressed in its entirety.

### [P1] Transition transactions can commit no-op writes with success audit records — ADDRESSED

This is the code-quality restatement of the first P1 finding and is resolved by the same lock-before-read and exact-change-count checks. A failed second update causes a rollback, so a partial transition cannot persist and a success audit cannot be committed for it.

### [P2] Audit assertions pass because request and invoice IDs collide — ADDRESSED

The audit test now queries invoice rows with `entity_type='invoice' AND entity_id=?` using `invoice.id`, and request rows with `entity_type='service_request' AND entity_id=?` using `request.id`. It independently asserts the invoice-generation, submission, rejection, confirmation, and request-approval action sequence, eliminating the former accidental primary-key collision.

## New Critical / Important breakage

None found.

## Verification

`node --test --test-concurrency=1 tests/payment-approval.test.mjs` passed: 8 tests passed, 0 failed.

An `npm test` run was also started, but the available command window returned after reporting only the first HTTP API subtest, so this re-review does not claim a fresh full-suite result.
