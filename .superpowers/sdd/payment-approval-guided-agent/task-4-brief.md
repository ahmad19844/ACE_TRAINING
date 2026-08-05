# Task 4: Functional Administrator and Client Menus

Read this first — it is your requirements.

Modify `src/App.jsx`, `src/styles.css`. Create `tests/navigation-content.test.mjs`.

Replace the current static dashboard body with a role-aware view router. Clicking each Administrator or Client sidebar item must render a distinct, meaningful functional view rather than only changing the active button. Preserve responsive navigation.

Administrator views: Overview; Customer Organizations; Staff & Assignments; Services & Packages; Projects & Approvals; Invoices & Payments; Support Cases; Security & Audit.

Client views: Overview; New Service Request; My Projects; Guided Agent; Automation Performance; Invoices & Payments; Support Cases; Organization & Privacy.

Staff navigation must remain assignment-scoped and should continue to expose Overview, Assigned Work, Assessments, Testing & Deployment, Support Cases, Knowledge & Training.

Required interactions:

- Client submits a request from New Service Request.
- Client sees request and commercial status in My Projects.
- Client Invoices & Payments shows linked invoices and a Pay ₦2,000 action only for `unpaid` invoices.
- After payment submission, Client sees `Payment Submitted—Pending Admin Confirmation` and cannot advance work.
- Admin Projects & Approvals shows all Client requests and allows approval only in `pending_admin_approval`.
- Admin Invoices & Payments shows submitted payments with Confirm and Reject actions.
- Admin Customer Organizations, Staff, Support, and Audit display role-query data.
- Guided Agent view shows locked messaging until request approval, then fetches and displays the request-derived plan with progress controls.
- Status copy must include `Awaiting Payment`, `Pending Admin Confirmation`, `Pending Admin Approval`, and `Approved—Agent Ready`.

All UI actions call the authenticated API. UI hiding is not authorization. Show loading, empty, success, and safe error states. Use Nigerian naira symbol `₦` everywhere.

Follow TDD. Source/content tests must prove dedicated view components/router exist and that payment/approval/agent controls are in their authorized views. Run `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs` and `npm test`. Self-review.

Write detailed report to `.superpowers/sdd/payment-approval-guided-agent/task-4-report.md`. Return only status, one-line tests, concerns. No Git commit.
