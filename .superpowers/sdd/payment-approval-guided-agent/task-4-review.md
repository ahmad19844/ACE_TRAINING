# Task 4 Review: Functional Administrator and Client Menus

## Spec-compliance verdict: Changes required

The implementation substantially satisfies the core workflow: Administrator and Client menus route to distinct views; Staff remains assignment-scoped; request creation, the ₦2,000 payment submission, Administrator confirmation/rejection, paid-request approval, and approved-only Guided Agent access use the authenticated API and agree with the server shapes. Required status copy and empty/action feedback are present. However, the responsive and safe-state requirements are not fully met because the only sign-out action disappears on mobile and an initial dashboard error is rendered as permanent loading.

### [P1] Preserve the only sign-out action on mobile

`src/styles.css:179` applies `.sidebar-foot{display:none}` below 760px. `src/App.jsx:93` places the only `Sign out securely` button inside that element, so every phone/tablet user in this breakpoint loses the ability to end the authenticated session from the UI. The navigation is horizontally scrollable, but this security-critical action must remain reachable in a compact mobile header/menu or another visible control.

### [P1] Render dashboard query failures instead of an endless spinner

`src/App.jsx:24` catches the initial `/dashboard` failure into top-level `notice`, but `src/App.jsx:36` does not pass that error to `Dashboard`, and `src/App.jsx:92` renders the loading screen for every falsy `data` value. A network, expiry, or server error therefore leaves the user at `Loading your secure workspace…` forever with neither safe error copy nor retry/sign-out recovery. Track loading and failure separately and render a retryable authenticated error state.

### [P2] Do not report a completed mutation as failed when refresh fails

The mutation handlers place both the state-changing request and subsequent `refresh()` inside one `try` (`src/App.jsx:156`, `174`, `185`, `191`, `207`, `222`, and `260`). If the POST succeeds but the following dashboard GET fails, the UI reports an error, retains stale controls, and encourages a retry of an action that already committed. This is especially confusing for payment confirmation and approval. Preserve the mutation result/success state, then handle refresh failure separately with a “saved, but data could not be refreshed” recovery message or optimistic update.

## Code-quality verdict: Changes requested

The view decomposition is readable, the UI conditions mirror server workflow states, API errors are sanitized through a shared helper, and responsive card/table layouts are generally well structured. The primary maintainability concern is that the new test suite proves token presence rather than behavior or ownership, leaving the central Task 4 guarantees easy to regress.

### [P2] Make navigation tests prove routing and authorized ownership

`tests/navigation-content.test.mjs:5-54` runs all assertions against the entire source string. The tests pass if a menu label, role condition, endpoint, or button text is moved into the wrong role view—or even left in dead/commented code—and they do not assert that every menu item maps to a distinct component. This does not substantiate the report's claim that controls are protected in their authorized views. At minimum, extract each router/component body and assert its mappings and forbidden controls; preferably render the role views with representative dashboard fixtures and verify visible actions and transitions.

## Verification evidence

- `node --test tests/navigation-content.test.mjs tests/portal-content.test.mjs`: 6 passed, 0 failed.
- `npm test`: 45 passed, 0 failed.
- `npm run build`: could not be independently rerun in the restricted review sandbox because esbuild was denied parent-directory traversal; the requested escalated rerun was unavailable due workspace approval-credit exhaustion. This is an environment limitation, not an observed source compilation defect.

## Overall recommendation

Request changes before accepting Task 4. The payment/approval/agent sequence and role-scoped data contract are implemented correctly under successful API conditions, but the two P1 issues violate the binding responsive/safe-state requirements. Address the mutation outcome handling and strengthen the tests in the same revision.
