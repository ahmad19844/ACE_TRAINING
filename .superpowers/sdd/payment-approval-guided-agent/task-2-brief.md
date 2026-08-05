# Task 2: Commercial API and Role Queries

Read this first — it is your requirements.

Modify `server/portal.mjs`, `server/index.mjs`, and `tests/api.test.mjs`.

Expose authenticated endpoints:

- `GET /api/invoices/:id`
- `POST /api/invoices/:id/pay`
- `POST /api/invoices/:id/confirm`
- `POST /api/invoices/:id/reject`
- `POST /api/requests/:id/approve`

Each route must obtain the opaque session token only from the `amy_session` cookie and delegate authorization to existing portal methods. Validate numeric identifiers and required rejection reason. Return safe 400, 401, or 403 responses without leaking internals.

Extend the dashboard/query service so Administrator dashboard data includes all organizations, Staff, service requests, invoices, support cases, and audit events; Client data includes only its own organization, requests, invoices, tickets, and agent availability; Staff data remains assignment-scoped. Include the fields later views need: Client ID, company, request title/status, invoice number/amount/status, payment reference/timestamps, Staff identity, and audit actor/action/time.

Follow TDD. Add failing API tests for Client payment submission, cross-organization denial, Admin confirmation, Admin rejection with reason, request approval after payment, and rejection of approval before payment. Preserve all existing authentication/security behavior.

Run `node --test tests/api.test.mjs tests/security-domain.test.mjs tests/payment-approval.test.mjs` and `npm test`. Self-review.

Write detailed report to `.superpowers/sdd/payment-approval-guided-agent/task-2-report.md`. Return only status, one-line test summary, concerns. No Git commit is possible.
