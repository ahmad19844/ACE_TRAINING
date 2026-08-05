import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const policy = await import("../src/dashboardPolicy.mjs").catch(() => null);

const expectedRoutes = {
  admin: {
    "Overview": "admin-overview",
    "Customer Organizations": "admin-organizations",
    "Staff & Assignments": "admin-staff",
    "Services & Packages": "admin-services",
    "Projects & Approvals": "admin-projects",
    "Invoices & Payments": "admin-invoices",
    "Support Cases": "admin-support",
    "Security & Audit": "admin-audit",
  },
  client: {
    "Overview": "client-overview",
    "New Service Request": "client-new-request",
    "My Projects": "client-projects",
    "Guided Agent": "client-agent",
    "Automation Performance": "client-performance",
    "Invoices & Payments": "client-invoices",
    "Support Cases": "client-support",
    "Organization & Privacy": "client-privacy",
  },
  staff: {
    "Overview": "staff-overview",
    "Assigned Work": "staff-work",
    "Assessments": "staff-assessments",
    "Testing & Deployment": "staff-testing",
    "Support Cases": "staff-support",
    "Knowledge & Training": "staff-training",
  },
};

function componentBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("pure dashboard policy maps every role menu to one distinct view", () => {
  assert.ok(policy, "dashboard navigation policy module must exist");
  assert.deepEqual(policy.dashboardRoutes, expectedRoutes);
  for (const [role, routes] of Object.entries(expectedRoutes)) {
    assert.deepEqual(Object.keys(routes), policy.menuForRole(role));
    assert.equal(new Set(Object.values(routes)).size, Object.keys(routes).length);
    for (const [menu, view] of Object.entries(routes)) assert.equal(policy.viewForRole(role, menu), view);
  }
  assert.equal(policy.viewForRole("client", "Security & Audit"), null);
  assert.deepEqual(policy.menuForRole("unknown"), []);
});

test("action policy assigns mutations only to their authorized role and view", () => {
  assert.ok(policy, "dashboard navigation policy module must exist");
  assert.deepEqual(policy.dashboardActions, {
    createStaff: { role: "admin", view: "admin-staff" },
    approveRequest: { role: "admin", view: "admin-projects" },
    confirmPayment: { role: "admin", view: "admin-invoices" },
    rejectPayment: { role: "admin", view: "admin-invoices" },
    createRequest: { role: "client", view: "client-new-request" },
    submitPayment: { role: "client", view: "client-invoices" },
    updateAgentProgress: { role: "client", view: "client-agent" },
    createSupportCase: { role: "client", view: "client-support" },
  });
  assert.equal(policy.actionAllowed("client", "Invoices & Payments", "submitPayment"), true);
  assert.equal(policy.actionAllowed("admin", "Invoices & Payments", "submitPayment"), false);
  assert.equal(policy.actionAllowed("client", "My Projects", "submitPayment"), false);
  assert.equal(policy.actionAllowed("client", "Guided Agent", "approveRequest"), false);
});

test("scoped view bodies own their endpoints and do not leak opposite-role actions", () => {
  const adminProjects = componentBody("AdminProjectsView", "AdminInvoicesView");
  const adminInvoices = componentBody("AdminInvoicesView", "AuditView");
  const newRequest = componentBody("NewServiceRequestView", "ClientProjectsView");
  const clientInvoices = componentBody("ClientInvoicesView", "GuidedAgentView");
  const guidedAgent = componentBody("GuidedAgentView", "AutomationPerformanceView");

  assert.match(adminProjects, /\/approve/);
  assert.doesNotMatch(adminProjects, /\/pay|\/confirm|\/reject/);
  assert.match(adminInvoices, /\/confirm/);
  assert.match(adminInvoices, /\/reject/);
  assert.doesNotMatch(adminInvoices, /\/pay|\/approve/);
  assert.match(newRequest, /api\("\/requests"/);
  assert.doesNotMatch(newRequest, /\/staff|\/approve|\/confirm|\/reject/);
  assert.match(clientInvoices, /\/pay/);
  assert.doesNotMatch(clientInvoices, /\/confirm|\/reject|\/approve/);
  assert.match(guidedAgent, /\/agent/);
  assert.doesNotMatch(guidedAgent, /\/pay|\/confirm|\/reject|\/approve/);
});

test("dashboard load mode distinguishes loading, retryable failure, and ready data", () => {
  assert.ok(policy, "dashboard navigation policy module must exist");
  assert.equal(policy.dashboardLoadMode(null, { phase: "loading", error: "" }), "loading");
  assert.equal(policy.dashboardLoadMode(null, { phase: "error", error: "Session expired" }), "error");
  assert.equal(policy.dashboardLoadMode({ role: "client" }, { phase: "ready", error: "" }), "ready");
});

test("completed mutation stays successful when the follow-up refresh fails", async () => {
  assert.ok(policy, "dashboard navigation policy module must exist");
  let commits = 0;
  let refreshes = 0;
  const result = await policy.runMutationThenRefresh({
    mutate: async () => { commits += 1; return { status: "payment_submitted" }; },
    refresh: async () => { refreshes += 1; throw new Error("dashboard unavailable"); },
  });

  assert.equal(commits, 1);
  assert.equal(refreshes, 1);
  assert.equal(result.value.status, "payment_submitted");
  assert.equal(result.refreshed, false);
  assert.equal(result.refreshError.message, "dashboard unavailable");
});

test("mutation failure rejects and never attempts refresh", async () => {
  assert.ok(policy, "dashboard navigation policy module must exist");
  let refreshes = 0;
  await assert.rejects(() => policy.runMutationThenRefresh({
    mutate: async () => { throw new Error("not authorized"); },
    refresh: async () => { refreshes += 1; },
  }), /not authorized/);
  assert.equal(refreshes, 0);
});

test("mobile navigation retains the only authenticated sign-out control", () => {
  const mobileRules = styles.slice(styles.indexOf("@media(max-width:760px)"));
  assert.doesNotMatch(mobileRules, /\.sidebar-foot\s*\{[^}]*display\s*:\s*none/);
  assert.match(mobileRules, /\.sidebar-foot\s*\{[^}]*display\s*:\s*flex/);
  assert.match(source, /Sign out securely/);
});

test("workflow statuses use the required commercial and agent-ready copy", () => {
  assert.match(source, /Awaiting Payment/);
  assert.match(source, /Payment Submitted—Pending Admin Confirmation/);
  assert.match(source, /Pending Admin Approval/);
  assert.match(source, /Approved—Agent Ready/);
  assert.match(source, /Simulate payment ₦2,000\.00/);
});
