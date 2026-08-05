# Task 5: Printable Invoice and Commercial Interaction Polish

Read this first — it is your requirements.

Modify `src/App.jsx`, `src/styles.css`, `README.md`, and applicable content tests.

Create a print-ready invoice detail view for a selected Client invoice. It must show:

- AI-Powered Business Automation Services / AMY Automation identity;
- invoice number;
- linked request number and title;
- Client ID;
- organization name;
- issue date;
- payment status;
- one service line item at exactly `₦2,000.00`;
- total exactly `₦2,000.00`;
- a `Print / Save Invoice` action using `window.print()`.

Add `@media print` CSS that hides navigation, actions, backdrops, and unrelated dashboard content while printing only the invoice on a clean white page. The Client must be able to generate/view the invoice before payment.

Polish all commercial interactions with disabled/loading controls, confirmation prompts for simulated payment and Admin confirm/reject/approve actions, safe error states, success feedback, and clear gated status copy. Do not introduce a real payment provider. Use `₦` consistently.

Update README with the exact lifecycle: request → invoice → Client simulated payment → Admin payment confirmation → Admin approval → guided agent. Explicitly document that simulated payment is for workflow validation and must be replaced by an approved payment provider before accepting real money.

Follow TDD: add failing content assertions for `₦2,000.00`, invoice fields, print action, print CSS, and README lifecycle. Run focused tests and `npm test`; self-review.

Write detailed report to `.superpowers/sdd/payment-approval-guided-agent/task-5-report.md`. Return only status/tests/concerns. No Git commit.
