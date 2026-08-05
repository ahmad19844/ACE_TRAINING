# Task 1: Invoice Creation and Payment Gate

Read this first — it is your requirements, with exact values to use verbatim.

Modify `server/database.mjs` and `server/portal.mjs`. Create `tests/payment-approval.test.mjs`.

Every new Client service request must create exactly one linked invoice in the same transaction. The invoice amount is exactly `2000`, displayed elsewhere as `₦2,000.00`. Initial request state is `awaiting_payment`; initial invoice state is `unpaid`.

Produce these portal methods:

- `submitPayment(token, invoiceId)`
- `confirmPayment(token, invoiceId)`
- `rejectPayment(token, invoiceId, reason)`
- `approvePaidRequest(token, requestId, staffId?)`

Required transitions:

- Client payment: invoice `unpaid → payment_submitted`; request `awaiting_payment → payment_pending_confirmation`; record a payment reference and timestamp.
- Admin rejection: invoice `payment_submitted → unpaid`; request returns to `awaiting_payment`; record reason.
- Admin confirmation: invoice `payment_submitted → paid`; request becomes `pending_admin_approval`; record confirmation time and Administrator.
- Admin approval: request `pending_admin_approval → approved`, only if linked invoice is `paid`; optional Staff assignment may be recorded.

Enforce role, tenant, current-state, and duplicate-action checks. Write audit events for invoice generation, payment submission, rejection, confirmation, and approval. Preserve existing tests unless they assert the superseded pre-payment request state; update only those expectations to the approved workflow.

Follow strict TDD: write each failing test and run it before implementation. Run the covering tests after implementation and self-review the result.

Write your detailed report to `.superpowers/sdd/payment-approval-guided-agent/task-1-report.md`. Return only: status, one-line test summary, and concerns. No Git commit is possible because the workspace has no Git metadata.
