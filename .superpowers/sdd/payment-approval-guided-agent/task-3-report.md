# Task 3 Report: Guided In-Portal Agent

## Delivered

- Added `agent_step_progress`, keyed by organization, request, and stable step key. It is the only table written by guided-agent progress updates.
- Added deterministic `getAgentPlan(token, requestId)` and `updateAgentStep(token, requestId, stepKey, completed)` portal methods.
- Added authenticated routes:
  - `GET /api/requests/:id/agent`
  - `PATCH /api/requests/:id/agent/:stepKey`
- Added a request-derived plan containing request and organization summaries, text-derived category, stable steps, required-information checklist, completion percentage, next incomplete step, and role-specific next action.
- Added audit events with action `agent.step_progress_updated` for every valid progress change.

## Authorization and State Safety

- The agent is unavailable until a request is in `approved` status.
- A Client can access only requests in its own organization. The organization check runs before the approval-state check so an outside Client cannot infer the state of another tenant's request.
- A Staff member must be the request's assigned Staff member. This check preserves the existing assignment boundary.
- An Administrator has oversight access.
- Progress updates write only to `agent_step_progress` and `audit_events`; they do not update service-request status, assignment, notes, timestamps, invoices, payment state, approval state, deployment state, or any other protected workflow field.

## Deterministic Plan Design

- Category is derived locally from the request title and description: `invoice/document`, `customer support`, `reporting/data`, `communications`, or `general automation`.
- The stable checklist keys are `discovery`, `required-data-input`, `workflow-design`, `testing`, and `handover`.
- The request description is used as the available business context and is returned as `expectedOutcome`; the current request schema has no distinct expected-outcome column.

## TDD Evidence

1. Added `tests/guided-agent.test.mjs` before production implementation.
2. Ran the test file and observed the expected red failure: `getAgentPlan is not a function` / `updateAgentStep is not a function`.
3. Added the isolated table, portal methods, and routes.
4. Added a tenant-isolation regression that initially failed because approval status was checked before Client authorization; reordered those checks and re-ran green.

## Test Coverage

`tests/guided-agent.test.mjs` verifies:

- lock before approval;
- request-derived plan, category, required context, and stable keys;
- Client tenant isolation before and after approval;
- unassigned Staff denial, assigned Staff access, and Administrator oversight;
- persisted progress, audit event, and protected-state non-mutation;
- invalid step-key rejection without persistence;
- authenticated GET and PATCH HTTP routes.

## Verification

- `node --test tests/guided-agent.test.mjs tests/payment-approval.test.mjs tests/security-domain.test.mjs` — 21 passed, 0 failed.
- `npm test` — executed after the final authorization hardening; the test runner completed without a reported failure.

## Self-Review

- Confirmed only the Task 3 files were changed: database schema, portal behavior, HTTP routes, focused tests, and this report.
- Confirmed the agent uses no network, model, or nondeterministic source.
- Confirmed invalid keys and non-boolean completion values fail before any write.
- Confirmed no Git commit was created.

## Review Round 1 Remediation

### Request-derived plan and stable keys

- Replaced the global step list with deterministic category guidance for invoice/document, customer support, reporting/data, communications, and general automation.
- Each plan now has the same required delivery phases (`discovery`, `required-data-input`, `workflow-design`, `testing`, and `handover`) but gives each phase category-specific instructions.
- Step keys are generated from the category, priority, and a deterministic fingerprint of the organization, title, description/business context, and priority. Repeated reads of a request return the same keys; materially different requests return different keys.

### Practical required-information checklist

- Added text-inferred checks for process owner, sample inputs, systems/integrations, volume/frequency, success criteria, and data sensitivity.
- `nextAction` now uses the same missing-information model: it names the actual missing inputs when there are any, and otherwise directs the current role to the next plan phase.

### Stronger safety and authorization regression coverage

- The progress test now snapshots the entire `service_requests` row and linked `invoices` row before and after an update.
- The Staff authorization test now verifies that an unassigned Staff member cannot mutate progress and that an assigned Staff member can.
- The HTTP route test now verifies malformed `completed` input returns 400 and leaves the plan unchanged before a valid update.
- The plan test now compares invoice/document and customer-support requests across organizations, priorities, and business contexts. It proves repeatability for the same request, distinct keys and specialized step content for different requests, complete inferred context for one request, and accurate missing context plus next action for another.

### Review Round 1 Verification

- Red: the contrasting-request test failed before implementation because both requests returned the identical global key list.
- Green: `node --test tests/guided-agent.test.mjs tests/payment-approval.test.mjs tests/security-domain.test.mjs` — 21 passed, 0 failed.
- Full: `npm test` — executed after the final HTTP invalid-input assertion with no reported failure.
