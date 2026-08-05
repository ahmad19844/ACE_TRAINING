# Task 4 Report: Functional Administrator and Client Menus

## Delivered

- Replaced the static dashboard body with `DashboardViewRouter`, which delegates to dedicated Administrator, Client, and Staff view routers.
- Preserved the responsive sidebar navigation and added `aria-current="page"` to the active destination.
- Added the missing Client `Guided Agent` navigation destination.
- Kept Staff navigation assignment-scoped with Overview, Assigned Work, Assessments, Testing & Deployment, Support Cases, and Knowledge & Training.
- Added loading, empty, success, and safe error presentation for authenticated queries and mutations.
- Extended the existing visual system with responsive cards, split views, payment actions, project records, and Guided Agent progress controls.

## Authenticated Data and API Contract Used

Task 4 was implemented against the existing server contract rather than inventing client-only state:

- `GET /api/dashboard` supplies role-scoped organizations, Staff, service requests, invoices, support cases, Guided Agent availability, and Administrator audit events.
- `POST /api/requests` creates a Client service request and its linked unpaid ₦2,000 invoice.
- `POST /api/invoices/:id/pay` submits Client payment evidence.
- `POST /api/invoices/:id/confirm` and `POST /api/invoices/:id/reject` are exposed only in the Administrator payment view when an invoice is `payment_submitted`.
- `POST /api/requests/:id/approve` is exposed only in the Administrator project view when a request is `pending_admin_approval`.
- `GET /api/requests/:id/agent` loads an approved request-derived plan.
- `PATCH /api/requests/:id/agent/:stepKey` persists Guided Agent checklist progress.
- `POST /api/staff` and `POST /api/tickets` remain authenticated role actions in their dedicated views.

The UI conditions are presentation safeguards only. The existing server authorization and workflow checks remain authoritative.

## Administrator Views

- **Overview:** role metrics, recent service requests, and service health.
- **Customer Organizations:** authenticated organization records with Client IDs, locations, and status.
- **Staff & Assignments:** Staff governance records plus authorized Staff-account creation.
- **Services & Packages:** meaningful service catalogue and ₦2,000 assessment package.
- **Projects & Approvals:** all Client requests, with approval controls rendered only for `pending_admin_approval` requests and optional active-Staff assignment.
- **Invoices & Payments:** all invoices, with Confirm and reason-required Reject controls rendered only for `payment_submitted` invoices.
- **Support Cases:** role-query support records.
- **Security & Audit:** authenticated audit action, actor, entity, outcome, and timestamp records.

## Client Views

- **Overview:** Client metrics and recent scoped requests.
- **New Service Request:** inline authenticated submission form; success copy explains the linked ₦2,000 invoice and Awaiting Payment state.
- **My Projects:** combines each request with its linked invoice, commercial status, assignment, and approval state.
- **Guided Agent:** locked guidance before approval; after approval it fetches the selected request-derived plan and exposes persisted checklist progress controls.
- **Automation Performance:** approved versus commercially gated work and monitoring readiness.
- **Invoices & Payments:** linked invoices with `Pay ₦2,000` rendered only for `unpaid`; successful submission reports `Payment Submitted—Pending Admin Confirmation` and explicitly states work cannot advance.
- **Support Cases:** role-query cases plus authenticated Client case creation.
- **Organization & Privacy:** organization/account profile and tenant-boundary explanation.

## Workflow Copy and Currency

The UI maps protected workflow values to the required user-facing copy:

- `awaiting_payment` / `unpaid` → `Awaiting Payment`
- `payment_pending_confirmation` → `Payment Submitted—Pending Admin Confirmation`
- `payment_submitted` → `Pending Admin Confirmation`
- `pending_admin_approval` → `Pending Admin Approval`
- `approved` → `Approved—Agent Ready`

All displayed money uses the Nigerian naira symbol `₦`.

## TDD Evidence

1. Created `tests/navigation-content.test.mjs` before modifying production UI code.
2. Ran `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs` and observed four expected failures for the missing role router, dedicated views, authorized payment/approval controls, Guided Agent controls, and required status copy. The two legacy portal-content tests remained green.
3. Implemented the role-aware router, dedicated views, authenticated actions, workflow copy, and responsive styling.
4. Re-ran the focused suite and observed 6 passed, 0 failed.

The new content tests protect these realistic regressions:

- removal of the role-aware dashboard router or a role-specific view router;
- removal of a required Administrator, Client, or Staff destination;
- relocation/removal of Client request, unpaid-invoice payment, or Guided Agent progress controls;
- relocation/removal of Administrator submitted-payment and pending-approval controls;
- loss of role-query organization, Staff, support, or audit views;
- loss of required commercial and agent-ready status copy.

## Verification

- Focused: `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs` — 6 passed, 0 failed.
- Full: `npm test` — 45 passed, 0 failed.
- Production build: `npm run build` — Vite transformed 29 modules and completed Sites packaging successfully. The first sandboxed attempt could not traverse the parent path required by esbuild; the approved out-of-sandbox rerun passed.

## Self-Review

- Re-read every Task 4 requirement against the final router and view controls.
- Confirmed Client payment is shown only for `unpaid` invoices, Administrator payment actions only for `payment_submitted`, and Administrator approval only for `pending_admin_approval`.
- Confirmed the old generic request transition control and modal-driven static dashboard body were removed.
- Confirmed all state-changing controls invoke authenticated API endpoints and refresh role-scoped dashboard data after success.
- Confirmed Guided Agent progress updates do not mutate request workflow state from the UI.
- Confirmed Staff receives only the already assignment-scoped dashboard records.
- Confirmed responsive rules retain horizontally scrollable mobile navigation and collapse multi-column views safely.
- Confirmed only Task 4 source, style, test, and report files were intentionally edited; no Git commit was created.

## Files

- Modified `src/App.jsx`
- Modified `src/styles.css`
- Created `tests/navigation-content.test.mjs`
- Created `.superpowers/sdd/payment-approval-guided-agent/task-4-report.md`

## Residual Concern

- The requested tests are source/content tests and the repository has no browser DOM interaction harness. The production build validates JSX/CSS compilation, while server integration suites validate all API authorization and workflow transitions; click-level behavior is not exercised by an automated browser test in Task 4.

## Review Round 1 Remediation

### Mobile sign-out

- Replaced the mobile `.sidebar-foot { display:none }` rule with a compact flex layout.
- Mobile keeps the authenticated `Sign out securely` button visible while hiding only the redundant user name/email text.
- Added a focused CSS regression that rejects any mobile rule hiding `.sidebar-foot` and requires its flex presentation.

### Dashboard query safe state

- Added explicit `idle`, `loading`, `ready`, and `error` dashboard request state instead of treating every missing dashboard value as loading.
- Initial `/api/dashboard` failures now render a safe authenticated error card with the sanitized API message, `Retry dashboard`, and `Sign out securely` actions.
- Added and wired the pure `dashboardLoadMode(data, requestState)` behavior, with direct tests for loading, retryable error, and ready modes.

### Mutation commit versus refresh failure

- Added `runMutationThenRefresh`, which rejects only when the mutation itself fails and returns a separate `refreshError` after a completed mutation.
- Updated Staff creation, request creation, support-case creation, Client payment submission, Administrator payment confirmation/rejection, and request approval to use the shared lifecycle.
- Successful mutations always retain their success notice. A failed follow-up refresh now renders a separate `Saved successfully, but current data could not be refreshed` warning with an explicit `Retry refresh` action.
- Stale mutation controls are disabled while refresh recovery is required, preventing accidental retries of already committed payment or approval actions.
- Added behavior tests proving a refresh failure preserves the committed result and that a mutation failure never attempts refresh.

### Navigation and action ownership tests

- Added `src/dashboardPolicy.mjs` as the pure source of truth for all Administrator, Client, and Staff menu-to-view mappings.
- Wired both visible navigation and the dashboard view router to that mapping.
- Added exact tests for every role/menu/view entry, uniqueness of each role's views, invalid cross-role destinations, and the complete authorized action-owner map.
- Added scoped component-body tests proving approval, confirmation/rejection, payment, request creation, and Guided Agent endpoints remain in their authorized views and are absent from opposite-role view bodies.
- The lightweight pure tests require no new dependency or browser harness.

### Review Round 1 TDD and verification evidence

1. Replaced the broad whole-source assertions before production changes.
2. Red: `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs` reported 6 failures: missing policy/behavior module (5) and the mobile sign-out rule (1). Existing scoped endpoint and legacy content checks remained green.
3. Green after the pure policy module: 7/8 navigation tests passed, leaving only the mobile sign-out regression red.
4. Green after App/CSS remediation: focused suite passed 10/10.
5. Full: `npm test` passed 49/49 with 0 failures.
6. Current production build rerun was not permitted: the required out-of-sandbox `npm run build` request was rejected because the workspace is out of approval credits. No workaround was attempted. The pre-review Task 4 build evidence above remains the latest successful build.

### Review Round 1 files

- Modified `src/App.jsx`
- Modified `src/styles.css`
- Created `src/dashboardPolicy.mjs`
- Reworked `tests/navigation-content.test.mjs`
- Appended this report
- No Git commit created
