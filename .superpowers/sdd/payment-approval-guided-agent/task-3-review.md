# Task 3 Review: Guided In-Portal Agent

## Spec Compliance Verdict: FAIL

The implementation correctly keeps the local agent locked until approval, enforces Client organization isolation before revealing approval state, limits Staff to their assigned request, permits Administrator oversight, persists progress by organization/request/step, rejects unknown keys and non-boolean completion values before writing, and records progress audits in the same transaction. Both authenticated routes exist and use the established cookie session. The required focused suite passes 21/21, and the full suite passes 41/41.

The task is not spec-compliant overall because its recommended steps and keys are not request-derived, despite that being a binding requirement. The required-information output is also too shallow to expose the missing implementation inputs the guided workflow is supposed to identify, and the tests do not fully prove the requested protected-state boundary.

### [P1] The task list is global boilerplate rather than a stable request-derived plan

`AGENT_STEP_DEFINITIONS` is a single constant array with the same five keys, titles, and descriptions for every request (`server/portal.mjs:5-11`). `buildAgentPlan` merely overlays stored completion values onto that array (`server/portal.mjs:106-110`). Request title and description affect only the category, while priority and organization do not influence any step or key (`server/portal.mjs:119-134`). Consequently, an invoice-extraction request and a customer-support request receive byte-for-byte identical recommended tasks even though the brief explicitly requires the approved request's title, description, priority, business context/expected outcome, and organization to generate stable task keys and request-derived steps.

The five required phases can remain stable, but each step must be deterministically specialized from request context, with stable keys derived from that deterministic plan. For example, the data-input and testing steps should name the category/request-specific inputs and outcomes rather than returning the same generic sentence for all organizations and requests.

### [P2] The required-information checklist cannot identify the practical context the workflow is missing

The checklist contains only request title, description-as-business-context, priority, and organization (`server/portal.mjs:129-134`). Title and description are mandatory at request creation and organization is mandatory at registration (`server/portal.mjs:156-174`, `server/portal.mjs:254-260`), so the checklist normally reports every item supplied. It does not assess request-specific implementation inputs such as source systems/data, access, stakeholders, acceptance criteria, exception paths, or handover owner. This falls short of a useful supplied/missing-context checklist for the required discovery and data/input phases.

The inconsistency is visible in `nextAction`: a Client is always told to provide missing business context while steps remain (`server/portal.mjs:113-117`), even when every `requiredInformation` entry says it is supplied. Required information and next action should be generated from the same deterministic missing-context model.

### [P2] The test does not prove the full protected-state non-mutation requirement

The protected-state regression snapshots only four columns from `service_requests`: `status`, `assigned_staff_id`, `last_note`, and `updated_at` (`tests/guided-agent.test.mjs:104-113`). It does not snapshot the linked invoice/payment fields or the full request row, despite the brief explicitly requiring tests to prove that payment, approval, assignment, deployment, and other protected workflow state do not mutate. The production SQL currently appears safely limited to `agent_step_progress` and `audit_events` (`server/portal.mjs:350-360`), but the mandated proof is incomplete and would not catch a future accidental invoice/payment mutation.

## Code Quality Verdict: FAIL

The implementation is compact and readable, uses parameterized SQL, validates authorization through one shared guard, performs the progress upsert and audit atomically, and cleanly separates plan building from HTTP routing. Those are strong foundations. Quality nevertheless fails because the core plan abstraction ignores the inputs it claims to model, and the focused tests encode that incomplete behavior as if it were request-derived.

### [P1] The focused test labels a plan request-derived without checking that its steps vary by request

The test named `guided agent returns a request-derived reporting plan with stable keys after approval` verifies echoed request fields, category, and a hard-coded global key list (`tests/guided-agent.test.mjs:43-64`). It never creates a materially different request and compares the generated task content or keys. As a result, the central functional defect passes under a misleading test name. Add contrasting requests across categories, priorities, organizations, and business contexts; assert deterministic repeatability for the same request and meaningful task specialization across different requests.

### [P2] Authorization and state-safety tests cover narrower paths than their claims

The unassigned-Staff test checks only `getAgentPlan`, not `updateAgentStep`, and assigned Staff/Admin checks only plan reads (`tests/guided-agent.test.mjs:80-94`). The shared guard makes the current mutation path safe, but a route-specific regression would prevent future drift. Likewise, invalid-key coverage does not test malformed completion values through the HTTP route, and the protected-state assertion is limited as described above. These omissions make the suite less robust than the report's claim that assignment enforcement, safe invalid input handling, and all protected-state boundaries are proved.

## Verification

- Reviewed `task-3-brief.md`, `task-3-report.md`, `server/database.mjs`, `server/portal.mjs`, `server/index.mjs`, and `tests/guided-agent.test.mjs` directly.
- Fresh focused run passed: `node --test tests/guided-agent.test.mjs tests/payment-approval.test.mjs tests/security-domain.test.mjs` — 21 passed, 0 failed, exit 0.
- Fresh full run passed: `npm test` — 41 passed, 0 failed, exit 0.
- No application source or test files were modified by this review; only this review artifact was created.
