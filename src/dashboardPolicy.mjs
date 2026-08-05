export const dashboardRoutes = {
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

export const dashboardActions = {
  createStaff: { role: "admin", view: "admin-staff" },
  approveRequest: { role: "admin", view: "admin-projects" },
  confirmPayment: { role: "admin", view: "admin-invoices" },
  rejectPayment: { role: "admin", view: "admin-invoices" },
  createRequest: { role: "client", view: "client-new-request" },
  submitPayment: { role: "client", view: "client-invoices" },
  updateAgentProgress: { role: "client", view: "client-agent" },
  createSupportCase: { role: "client", view: "client-support" },
};

export function menuForRole(role) {
  return Object.keys(dashboardRoutes[role] ?? {});
}

export function viewForRole(role, menu) {
  return dashboardRoutes[role]?.[menu] ?? null;
}

export function actionAllowed(role, menu, action) {
  const owner = dashboardActions[action];
  return Boolean(owner && owner.role === role && owner.view === viewForRole(role, menu));
}

export function dashboardLoadMode(data, requestState) {
  if (data) return "ready";
  return requestState?.phase === "error" ? "error" : "loading";
}

export async function runMutationThenRefresh({ mutate, refresh }) {
  const value = await mutate();
  try {
    await refresh();
    return { value, refreshed: true, refreshError: null };
  } catch (refreshError) {
    return { value, refreshed: false, refreshError };
  }
}
