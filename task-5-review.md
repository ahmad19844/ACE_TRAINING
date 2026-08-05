# Task 5 Review: Printable Invoice and Commercial Interaction Polish

## Verdicts

- **Specification compliance: PASS.** The current implementation satisfies every binding Task 5 requirement found in the brief.
- **Code quality: PASS WITH NON-BLOCKING CONCERNS.** The implementation is coherent and preserves the existing authorization and mutation-recovery design, but the static content tests are weaker than their names imply and the shared per-invoice busy state produces ambiguous loading labels.
- **Overall: APPROVE.** No blocking defect was found. The concerns below should be addressed as follow-up hardening.

## Specification compliance review

### PASS: printable Client invoice is available before payment

- `ClientInvoicesView` always exposes **View invoice**, including for an unpaid invoice, while the simulated-payment button is gated separately by `invoice.status === "unpaid"` (`src/App.jsx:245-257`).
- `InvoiceDetail` includes the required service identity, invoice number, linked request number and title, Client ID, organization, issue date, payment status, one service line, and a total (`src/App.jsx:260-261`).
- The line item and total both render through `formatNairaDecimal(invoice.amount)`. Invoice creation fixes the amount at `2000`, and the domain test verifies that invariant (`server/portal.mjs:327-337`, `tests/payment-approval.test.mjs:26-39`), yielding exactly `₦2,000.00`.
- **Print / Save Invoice** calls `window.print()` (`src/App.jsx:260-261`).

### PASS: print isolation

- The print rules hide all page content first, restore visibility only for `.invoice-print-area`, explicitly remove navigation, headers, actions, backdrops, and payment controls, and strip the invoice border/shadow onto a white page (`src/styles.css:264-274`).
- The selected invoice is positioned at the print-page origin, so hidden dashboard content does not reserve printable layout space (`src/styles.css:269-271`).

### PASS: commercial interaction states and gates

- Client simulated payment and Administrator confirm, reject, and approve actions each require a specific `window.confirm(...)` prompt before mutation (`src/App.jsx:188-221`, `src/App.jsx:245-255`).
- Each action disables the affected controls while busy, presents a loading label, catches API failures into an alert, reports success, and preserves a successful mutation when the follow-up dashboard refresh fails (`src/App.jsx:188-221`, `src/App.jsx:245-257`, `src/App.jsx:337-346`).
- Copy clearly communicates the gates from awaiting payment through Administrator confirmation and approval to Guided Agent availability (`src/App.jsx:200-221`, `src/App.jsx:253-257`, `src/App.jsx:281`, `src/App.jsx:321-328`).
- No real payment provider was added; the Client action remains an internal simulated workflow POST and explicitly says it does not collect real money (`src/App.jsx:250-253`).

### PASS: README warning and lifecycle

- README states the exact required lifecycle (`README.md:33-35`).
- README explicitly warns that simulated payment is only for workflow validation and must be replaced by an approved payment provider before accepting real money (`README.md:37`).

## Findings and code-quality concerns

### [P2] Invoice/content assertions do not prove that required strings belong to the invoice

`tests/portal-content.test.mjs:27-44` searches the entire `App.jsx` and stylesheet independently. In particular, `₦2,000.00` can be satisfied by the simulated-payment button at `src/App.jsx:257`; the test does not assert that both the invoice line item and total render that exact value. The same issue applies to field labels and the print CSS: a matching token anywhere in the file passes. This is not a present runtime defect—the implementation is correct—but it is weak regression protection for the binding requirement. Extract the `InvoiceDetail` component body (as `navigation-content.test.mjs` already does for scoped components) or add a rendered component test with an unpaid `2000` invoice, and assert the amount appears twice plus the required field/value relationships.

### [P3] Confirm and reject display simultaneous, contradictory loading labels

`AdminInvoicesView` uses one `busyId` for both confirmation and rejection (`src/App.jsx:203-221`). During confirmation, the disabled reject button displays **Rejecting…**; during rejection, the disabled confirm button displays **Confirming…**. The controls are safely disabled, so this is not a state-integrity problem, but the feedback is misleading. Track `{ id, action }` (or separate pending action state) and show a loading label only for the operation actually running.

## Verification evidence

- `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs`: **12 passed, 0 failed**.
- `npm test`: **51 passed, 0 failed**.
- `npm run build`: **not verified in this sandbox**. Vite/esbuild failed while resolving `vite.config.mjs` because access to the parent directory was denied. This reproduces the limitation in `task-5-report.md`; it does not identify a source-code build error.

## Review limitations

- The directory is not a Git worktree, so review was performed against the current files rather than a baseline diff.
- A rendered browser/print-preview smoke test was not available because the production tooling is blocked by the filesystem permission boundary. Print correctness was assessed from the DOM structure and print CSS.
