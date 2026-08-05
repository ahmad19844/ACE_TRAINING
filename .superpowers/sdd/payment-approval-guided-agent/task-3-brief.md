# Task 3: Guided In-Portal Agent

Read this first — it is your requirements.

Modify `server/database.mjs`, `server/portal.mjs`, `server/index.mjs`. Create `tests/guided-agent.test.mjs`.

Produce portal methods `getAgentPlan(token, requestId)` and `updateAgentStep(token, requestId, stepKey, completed)`. Expose authenticated routes `GET /api/requests/:id/agent` and `PATCH /api/requests/:id/agent/:stepKey`.

The agent is deterministic and local. It must reject requests that are not `approved`, reject cross-organization Client access, and allow Admin oversight plus assigned Staff access without expanding assignment permissions.

Use the approved request's title, description, priority, expected outcome or available business context, and organization to generate stable task keys. At minimum return:

- request and organization summary;
- category derived from text (invoice/document, customer support, reporting/data, communications, or general automation);
- recommended steps covering discovery, required data/input, workflow design, testing, and handover;
- required-information checklist showing supplied/missing context;
- completion percentage;
- next incomplete step and the next action permitted for the current role.

Persist checklist completion by organization/request/step key. Updating progress must not mutate payment, approval, assignment, deployment, or other protected workflow state. Write an audit event for each progress change. Invalid or unknown step keys must fail safely.

Follow strict TDD. Tests must prove the lock before approval, request-derived plan after approval, Client tenant isolation, unassigned Staff denial, stable keys, progress persistence, invalid-key rejection, and no protected-state mutation.

Run `node --test tests/guided-agent.test.mjs tests/payment-approval.test.mjs tests/security-domain.test.mjs` and `npm test`. Self-review.

Write detailed report to `.superpowers/sdd/payment-approval-guided-agent/task-3-report.md`. Return only status, one-line test summary, concerns. No Git commit.
