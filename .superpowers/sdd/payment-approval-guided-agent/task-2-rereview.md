# Task 2 Re-review: Commercial API and Role Queries

## Overall verdict: PASS

All findings from `task-2-review.md` are addressed. I found no new Critical or Important breakage introduced by the review fixes.

## Prior finding verdicts

| Prior finding | Severity | Verdict | Evidence |
| --- | --- | --- | --- |
| Malformed JSON bypasses the safe error contract and exposes a stack trace | P1 | **ADDRESSED** | A terminal Express error middleware in `server/index.mjs` catches pre-route `express.json` failures and returns a JSON generic error. The regression sends `{` to the reject route and verifies HTTP 400, JSON content type, exact safe envelope, and no stack/path markers. |
| Client invoice reads do not validate the linked request tenant | P2 | **ADDRESSED** | `invoiceJoin` now joins `service_requests`; Client invoice listing requires both records to belong to the session organization and to each other. `getInvoice` applies the equivalent three-way check. The regression corrupts the invoice organization link and confirms direct read is 403 and the dashboard does not list it. |
| Administrator dashboard omits inactive Staff records | P2 | **ADDRESSED** | `listStaff(false)` is used for Administrator `staffMembers`, with no active-status predicate and with `status` selected. Client `agentAvailability` keeps `listStaff(true)`. The regression verifies an inactive Staff record is visible to the Administrator but not advertised to a Client. |
| The error boundary covers route actions but not request parsing | P1 | **ADDRESSED** | This is the code-quality restatement of the malformed-JSON P1. The terminal middleware now covers request-parser errors; the added API regression passes. |
| Security/scoping tests omit malformed transport and inconsistent-record cases | P2 | **ADDRESSED** | `tests/api.test.mjs` now contains direct regressions for malformed JSON, mismatched invoice/request organization IDs (both direct and dashboard reads), and inactive Staff governance visibility. |
| Dashboard test hard-codes a database-generated Staff ID | P3 | **ADDRESSED** | The dashboard test reads the `POST /api/staff` response and supplies `staff.id` to the approval route instead of fixture-dependent `4`. |

## Regression check

The review fixes preserve the required behavior:

- Cookie-only session handling, ID/reason validation, payment transitions, and approval gating remain covered and passing.
- The terminal error boundary returns a generic JSON 500 for unexpected middleware errors and a generic JSON 4xx body for client errors; it does not expose exception messages.
- Administrator invoice visibility remains global, while the extra tenant invariant is enforced only for Client visibility as required.

No new Critical or Important findings attributable to these fixes were identified.

## Verification

Fresh commands completed successfully in this re-review:

```text
node --test tests/api.test.mjs
# tests 12
# pass 12
# fail 0

node --test tests/api.test.mjs tests/security-domain.test.mjs tests/payment-approval.test.mjs
# exit 0

npm test
# exit 0
```

Node emitted only its existing experimental SQLite warning.
