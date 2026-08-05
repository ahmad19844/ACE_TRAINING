import { useEffect, useState } from "react";
import { dashboardLoadMode, menuForRole, runMutationThenRefresh, viewForRole } from "./dashboardPolicy.mjs";

const roles = [
  { id: "admin", label: "Administrator Login", hint: "Platform governance", icon: "A" },
  { id: "client", label: "Client Login", hint: "Manage your services", icon: "C" },
  { id: "staff", label: "Staff Login", hint: "Deliver assigned work", icon: "S" },
];

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: "same-origin", ...options, headers: { "content-type": "application/json", ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request could not be completed");
  return body;
}

export function App() {
  const [screen, setScreen] = useState("login");
  const [role, setRole] = useState("client");
  const [user, setUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardRequest, setDashboardRequest] = useState({ phase: "idle", error: "" });
  const [notice, setNotice] = useState("");

  useEffect(() => { api("/session").then(({ user: current }) => { setUser(current); setScreen(current.mustChangePassword ? "change-password" : "dashboard"); }).catch(() => {}); }, []);
  useEffect(() => { if (screen === "dashboard") loadDashboard().catch(() => {}); }, [screen]);

  const loadDashboard = async () => {
    setDashboardRequest({ phase: "loading", error: "" });
    try {
      const nextDashboard = await api("/dashboard");
      setDashboard(nextDashboard);
      setDashboardRequest({ phase: "ready", error: "" });
      return nextDashboard;
    } catch (error) {
      setDashboard(null);
      setDashboardRequest({ phase: "error", error: error.message });
      throw error;
    }
  };

  const refresh = async () => {
    const nextDashboard = await api("/dashboard");
    setDashboard(nextDashboard);
    setNotice("");
    return nextDashboard;
  };
  const logout = async () => { await api("/auth/logout", { method: "POST", body: "{}" }); setUser(null); setDashboard(null); setDashboardRequest({ phase: "idle", error: "" }); setScreen("login"); };

  if (screen === "signup") return <SignupScreen onBack={() => setScreen("login")} onSuccess={(result) => setNotice(`Account created. Your permanent Client ID is ${result.clientId}. You can now sign in.`)} />;
  if (screen === "change-password") return <ChangePassword onComplete={() => { setUser((value) => ({ ...value, mustChangePassword: false })); setScreen("dashboard"); }} />;
  if (screen === "dashboard") return <Dashboard data={dashboard} requestState={dashboardRequest} retry={loadDashboard} refresh={refresh} logout={logout} />;

  return <LoginPortal role={role} setRole={setRole} notice={notice} onSignup={() => setScreen("signup")} onLogin={(result) => { setUser(result.user); setScreen(result.next === "change-password" ? "change-password" : "dashboard"); }} />;
}

function LoginPortal({ role, setRole, onLogin, onSignup, notice }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const activeRole = roles.find((item) => item.id === role);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try { onLogin(await api("/auth/login", { method: "POST", body: JSON.stringify({ role, identity: form.get("identity"), password: form.get("password") }) })); }
    catch (problem) { setError(problem.message); } finally { setBusy(false); }
  };
  return <main className="portal-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">AMY</span><span>Automation Services</span></div><div className="topbar-note"><span className="live-dot" /> Secure portal online <a href="mailto:support@amyautomation.ng">Get support</a></div></header>
    <section className="hero" id="main-content"><p className="eyebrow">Practical AI · Measurable results</p><h1>AI-Powered Business Automation Services</h1><p className="hero-copy">Streamline operations. Delight clients. Empower teams. Grow with confidence.</p></section>
    <nav className="role-tabs" aria-label="Choose login portal">{roles.map((item) => <button className={`role-tab ${role === item.id ? "is-active" : ""}`} key={item.id} onClick={() => setRole(item.id)}><span className="role-symbol">{item.icon}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</nav>
    <section className="access-grid">
      <div className="login-panel"><p className="panel-kicker">Secure access portal</p><h2>{activeRole.label}</h2><p className="welcome">Welcome back. Enter your authorized credentials.</p>{(notice || error) && <div className={error ? "notice error" : "notice success"}>{error || notice}</div>}
        <form className="login-form" onSubmit={submit}><label htmlFor="identity">{role === "admin" ? "Username" : "Email Address"}</label><input id="identity" name="identity" type={role === "admin" ? "text" : "email"} placeholder={role === "admin" ? "admin_control" : "you@company.com"} required />
          <div className="label-row"><label htmlFor="password">Password</label><span className="rule-hint">Exactly 12 characters</span></div><div className="password-field"><input id="password" name="password" type={showPassword ? "text" : "password"} minLength="12" maxLength="12" required /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
          <button className="primary-button" disabled={busy}>{busy ? "Verifying…" : "Sign In Securely"}</button></form>
        <div className="security-note"><span className="security-icon">✓</span><span><strong>Protected by role-based access</strong>Encrypted passwords, private sessions, and complete action records.</span></div>
        <div className="signup-row"><span>New client?</span><button className="outline-button" onClick={onSignup}>Client Sign Up →</button></div>
      </div>
      <figure className="collaboration-visual"><img src="/images/business-collaboration.png" alt="Business professionals collaborating around a laptop" /><figcaption><span>Built around your workflow</span><strong>From repetitive tasks to reliable growth.</strong><p>Assess · Build · Deploy · Support</p></figcaption></figure>
    </section>
  </main>;
}

function SignupScreen({ onBack, onSuccess }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget)); if (values.password !== values.confirmPassword) { setError("Passwords must match"); setBusy(false); return; } try { const created = await api("/auth/register", { method:"POST", body:JSON.stringify(values) }); setResult(created); onSuccess(created); } catch (problem) { setError(problem.message); } finally { setBusy(false); } };
  if (result) return <main className="centered-screen"><section className="success-card"><span className="success-seal">✓</span><p className="eyebrow">Registration complete</p><h1>Welcome, {result.fullName}</h1><p>Your permanent Client ID</p><strong className="client-id">{result.clientId}</strong><button className="primary-button" onClick={onBack}>Continue to Client Login</button></section></main>;
  return <main className="signup-shell"><button className="back-link" onClick={onBack}>← Back to secure login</button><section className="signup-intro"><p className="eyebrow">Start your automation journey</p><h1>Create your Client account</h1><p>Set up your organization profile. A permanent, unique Client ID will be issued instantly.</p></section>{error && <div className="notice error form-notice">{error}</div>}<form className="signup-form" onSubmit={submit}><Field label="Full Name" name="fullName" /><Field label="Email Address" name="email" type="email" /><Field label="Phone Number" name="phone" type="tel" /><Field label="State" name="state" placeholder="e.g. Lagos" /><Field label="Local Government Area (LGA)" name="lga" placeholder="e.g. Ikeja" /><Field label="Company/Organization Name" name="company" /><Field label="Password" name="password" type="password" hint="Exactly 12 characters with uppercase, lowercase, and a number." /><Field label="Confirm Password" name="confirmPassword" type="password" /><button className="primary-button wide" disabled={busy}>{busy ? "Creating secure account…" : "Create Client Account"}</button></form></main>;
}

function Field({ label, name, type = "text", hint, placeholder }) { return <label>{label}<input name={name} type={type} placeholder={placeholder} minLength={type === "password" ? 12 : undefined} maxLength={type === "password" ? 12 : undefined} required />{hint && <small>{hint}</small>}</label>; }

function ChangePassword({ onComplete }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); const values = Object.fromEntries(new FormData(event.currentTarget)); if (values.newPassword !== values.confirmPassword) { setError("New passwords must match"); setBusy(false); return; } try { await api("/auth/change-password", { method:"POST", body:JSON.stringify(values) }); onComplete(); } catch (problem) { setError(problem.message); } finally { setBusy(false); } };
  return <main className="centered-screen"><section className="password-card"><span className="security-icon large">!</span><p className="eyebrow">Security action required</p><h1>Change Default Password</h1><p>The default administrator password must be replaced before the Business command centre can be opened.</p>{error && <div className="notice error">{error}</div>}<form className="stack-form" onSubmit={submit}><Field label="Current Password" name="currentPassword" type="password" /><Field label="New 12-character Password" name="newPassword" type="password" /><Field label="Confirm New Password" name="confirmPassword" type="password" /><button className="primary-button" disabled={busy}>{busy ? "Securing account…" : "Secure Account & Continue"}</button></form></section></main>;
}

function Dashboard({ data, requestState, retry, refresh, logout }) {
  const [active, setActive] = useState("Overview");
  const loadMode = dashboardLoadMode(data, requestState);
  if (loadMode === "loading") return <main className="loading-screen"><span className="spinner" /> Loading your secure workspace…</main>;
  if (loadMode === "error") return <DashboardLoadError error={requestState.error} retry={retry} logout={logout} />;
  return <div className="app-shell"><aside className="sidebar"><div className="brand inverse"><span className="brand-mark">AMY</span><span>Automation</span></div><div className="role-chip">{data.role} workspace</div><nav aria-label={`${data.role} workspace`}>{menuForRole(data.role).map((item) => <button key={item} className={active === item ? "active" : ""} aria-current={active === item ? "page" : undefined} onClick={() => setActive(item)}>{item}</button>)}</nav><div className="sidebar-foot"><span>{data.user.fullName}</span><small>{data.user.email || data.user.username}</small><button onClick={logout}>Sign out securely</button></div></aside>
    <main className="dashboard-main"><header className="dashboard-header"><div><p className="eyebrow">{new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}</p><h1>{active}</h1><p>Welcome back, {data.user.fullName.split(" ")[0]}. This view is scoped to your authorized workspace.</p></div><button className="icon-button" aria-label="Notifications">◔<span /></button></header>
      <DashboardViewRouter active={active} data={data} refresh={refresh} />
    </main></div>;
}

function DashboardLoadError({ error, retry, logout }) {
  const [retrying, setRetrying] = useState(false);
  const retryLoad = async () => { setRetrying(true); try { await retry(); } catch { setRetrying(false); } };
  return <main className="loading-screen"><section className="dashboard-error-card" role="alert"><span className="security-icon large">!</span><p className="eyebrow">Workspace unavailable</p><h1>We could not load your dashboard</h1><p>{error || "The authenticated dashboard request could not be completed."}</p><p>Your account is still signed in. Retry safely or end this session.</p><div className="recovery-actions"><button className="primary-button" disabled={retrying} onClick={retryLoad}>{retrying ? "Retrying…" : "Retry dashboard"}</button><button className="outline-button" onClick={logout}>Sign out securely</button></div></section></main>;
}

function DashboardViewRouter({ active, data, refresh }) {
  const view = viewForRole(data.role, active);
  if (data.role === "admin") return <AdministratorView view={view} data={data} refresh={refresh} />;
  if (data.role === "client") return <ClientView view={view} data={data} refresh={refresh} />;
  return <StaffView view={view} data={data} />;
}

function AdministratorView({ view, data, refresh }) {
  if (view === "admin-organizations") return <OrganizationsView organizations={data.organizations} />;
  if (view === "admin-staff") return <StaffAssignmentsView staffMembers={data.staffMembers} refresh={refresh} />;
  if (view === "admin-services") return <ServicesPackagesView />;
  if (view === "admin-projects") return <AdminProjectsView requests={data.requests} staffMembers={data.staffMembers} refresh={refresh} />;
  if (view === "admin-invoices") return <AdminInvoicesView invoices={data.invoices} refresh={refresh} />;
  if (view === "admin-support") return <SupportCasesView tickets={data.tickets} role="admin" />;
  if (view === "admin-audit") return <AuditView events={data.auditEvents ?? []} />;
  return <OverviewView data={data} />;
}

function ClientView({ view, data, refresh }) {
  if (view === "client-new-request") return <NewServiceRequestView refresh={refresh} />;
  if (view === "client-projects") return <ClientProjectsView requests={data.requests} invoices={data.invoices} />;
  if (view === "client-agent") return <GuidedAgentView requests={data.requests} />;
  if (view === "client-performance") return <AutomationPerformanceView requests={data.requests} />;
  if (view === "client-invoices") return <ClientInvoicesView invoices={data.invoices} refresh={refresh} />;
  if (view === "client-support") return <SupportCasesView tickets={data.tickets} role="client" refresh={refresh} />;
  if (view === "client-privacy") return <OrganizationPrivacyView organization={data.organizations[0]} user={data.user} />;
  return <OverviewView data={data} />;
}

function StaffView({ view, data }) {
  if (view === "staff-support") return <SupportCasesView tickets={data.tickets} role="staff" />;
  if (view === "staff-training") return <KnowledgeTrainingView />;
  if (view === "staff-work") return <StaffWorkView title="Assigned Work" description="Every project shown here is explicitly assigned to your Staff account." requests={data.requests} />;
  if (view === "staff-assessments") return <StaffWorkView title="Assessments" description="Review requirements and document assessment findings for your assigned work." requests={data.requests} />;
  if (view === "staff-testing") return <StaffWorkView title="Testing & Deployment" description="Track validation and deployment readiness for assigned projects only." requests={data.requests} />;
  return <OverviewView data={data} />;
}

function ViewIntro({ kicker, title, description }) {
  return <div className="view-intro"><p className="panel-kicker">{kicker}</p><h2>{title}</h2><p>{description}</p></div>;
}

function OverviewView({ data }) {
  const approved = data.requests.filter((request) => request.status === "approved").length;
  return <div className="view-stack"><section className="metric-grid"><Metric label={data.role === "admin" ? "Customer Organizations" : data.role === "staff" ? "Assigned Work" : "Service Requests"} value={data.role === "admin" ? data.metrics.organizations : data.metrics.requests} trend="Live" /><Metric label={data.role === "admin" ? "Delivery Staff" : "Approved Projects"} value={data.role === "admin" ? data.metrics.staff : approved} trend="Monitored" /><Metric label="Service Requests" value={data.metrics.requests} trend="Workflow" /><Metric label="Support Cases" value={data.metrics.tickets} trend="SLA tracked" /></section>
    <section className="dashboard-grid"><div className="content-card"><ViewIntro kicker="Workflow pipeline" title="Recent service requests" description="Commercial and delivery status from your authorized records." /><RequestList rows={data.requests.slice(0, 5)} /></div><div className="content-card"><ViewIntro kicker="Operating health" title="Service pulse" description="A concise view of current workspace health." /><div className="health-score"><strong>98.4%</strong><span>Platform availability</span></div><div className="health-row"><span>Actions audited</span><b>100%</b></div><div className="health-row"><span>Data boundary</span><b className="good">Secure</b></div></div></section></div>;
}

function OrganizationsView({ organizations }) {
  return <section className="content-card"><ViewIntro kicker="Role query" title="Customer Organizations" description="Registered organizations returned by the authenticated Administrator dashboard query." />{organizations.length ? <div className="record-grid">{organizations.map((organization) => <article className="record-card" key={organization.id}><div className="card-heading"><b>{organization.company}</b><Status value={organization.status} /></div><strong>{organization.clientId}</strong><p>{organization.state}, {organization.lga}</p><small>{organization.phone}</small></article>)}</div> : <Empty text="No customer organizations have registered yet." />}</section>;
}

function StaffAssignmentsView({ staffMembers, refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const recovery = useRefreshRecovery(refresh);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setOutcome(null); recovery.clear();
    const form = event.currentTarget;
    try { const result = await runMutationThenRefresh({ mutate: () => api("/staff", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }), refresh }); form.reset(); setOutcome({ type: "success", text: "Staff account created and ready for assignment." }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  return <div className="split-view"><section className="content-card"><ViewIntro kicker="Delivery roster" title="Staff & Assignments" description="All active and inactive Staff governance records returned to Administrators." />{staffMembers.length ? staffMembers.map((member) => <div className="list-row" key={member.id}><span><b>{member.fullName}</b><small>{member.specialty} · {member.email}</small></span><Status value={member.status} /></div>) : <Empty text="No Staff accounts exist yet." />}</section><section className="content-card"><ViewIntro kicker="Authorized action" title="Create Staff account" description="New Staff see only work explicitly assigned to them." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} /><form className="stack-form" onSubmit={submit}><Field label="Full Name" name="fullName" /><Field label="Work Email" name="email" type="email" /><Field label="Specialty" name="specialty" placeholder="Automation Engineer" /><Field label="Initial 12-character Password" name="password" type="password" /><button className="primary-button" disabled={busy || recovery.blocked}>{busy ? "Creating account…" : "Create Staff Account"}</button></form></section></div>;
}

function ServicesPackagesView() {
  return <section className="content-card"><ViewIntro kicker="Commercial catalogue" title="Services & Packages" description="The approved service catalogue used to scope new engagements." /><div className="record-grid"><ServiceCard title="Workflow Assessment" price="₦2,000" text="Process discovery, opportunity review, and a guided implementation plan." /><ServiceCard title="Automation Delivery" price="Scoped after approval" text="Design, testing, deployment, monitoring, and handover." /><ServiceCard title="Managed Support" price="By service agreement" text="Operational monitoring, incident response, and continuous improvement." /></div></section>;
}

function ServiceCard({ title, price, text }) { return <article className="record-card"><p className="panel-kicker">{price}</p><h3>{title}</h3><p>{text}</p></article>; }

function AdminProjectsView({ requests, staffMembers, refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const recovery = useRefreshRecovery(refresh);
  const approve = async (event, request) => {
    event.preventDefault();
    if (!window.confirm(`Approve request REQ-${String(request.id).padStart(4, "0")} for delivery? The Guided Agent will become available to this Client.`)) return;
    setBusyId(request.id); setOutcome(null); recovery.clear();
    const staffId = new FormData(event.currentTarget).get("staffId");
    try { const result = await runMutationThenRefresh({ mutate: () => api(`/requests/${request.id}/approve`, { method: "POST", body: JSON.stringify({ staffId: staffId ? Number(staffId) : undefined }) }), refresh }); setOutcome({ type: "success", text: `Request REQ-${String(request.id).padStart(4, "0")} approved. The Guided Agent is ready.` }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusyId(null); }
  };
  return <section className="content-card"><ViewIntro kicker="Commercial gate" title="Projects & Approvals" description="Approve only paid requests that are in Pending Admin Approval." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} />{requests.length ? <div className="table-wrap"><table><thead><tr><th>Project</th><th>Organization</th><th>Status</th><th>Authorized action</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><b>{request.title}</b><small>REQ-{String(request.id).padStart(4, "0")}</small></td><td>{request.company}</td><td><Status value={request.status} /></td><td>{request.status === "pending_admin_approval" ? <form className="inline-action" onSubmit={(event) => approve(event, request)}><select name="staffId" aria-label={`Assign Staff for ${request.title}`} defaultValue="" disabled={busyId === request.id || recovery.blocked}><option value="">Unassigned</option>{staffMembers.filter((member) => member.status === "active").map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</select><button className="table-action" disabled={busyId === request.id || recovery.blocked}>{busyId === request.id ? "Approving…" : "Approve request"}</button></form> : <span className="muted-copy">No approval action is available until payment has been confirmed.</span>}</td></tr>)}</tbody></table></div> : <Empty text="No Client requests are awaiting review." />}</section>;
}

function AdminInvoicesView({ invoices, refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const recovery = useRefreshRecovery(refresh);
  const confirm = async (invoice) => {
    if (!window.confirm(`Confirm payment for ${invoice.invoiceNumber}? This moves the linked request to Pending Admin Approval.`)) return;
    setBusyAction({ id: invoice.id, action: "confirm" }); setOutcome(null); recovery.clear();
    try { const result = await runMutationThenRefresh({ mutate: () => api(`/invoices/${invoice.id}/confirm`, { method: "POST", body: "{}" }), refresh }); setOutcome({ type: "success", text: `${invoice.invoiceNumber} confirmed. Its project is now Pending Admin Approval.` }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusyAction(null); }
  };
  const reject = async (event, invoice) => {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get("reason");
    if (!window.confirm(`Reject payment for ${invoice.invoiceNumber} and return it to Awaiting Payment?`)) return;
    setBusyAction({ id: invoice.id, action: "reject" }); setOutcome(null); recovery.clear();
    try { const result = await runMutationThenRefresh({ mutate: () => api(`/invoices/${invoice.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }), refresh }); setOutcome({ type: "success", text: `${invoice.invoiceNumber} rejected and returned to Awaiting Payment.` }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusyAction(null); }
  };
  return <section className="content-card"><ViewIntro kicker="Payment governance" title="Invoices & Payments" description="Confirm or reject only payments submitted for Administrator verification." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} />{invoices.length ? <div className="payment-list">{invoices.map((invoice) => <article className="payment-card" key={invoice.id}><div><p className="panel-kicker">{invoice.invoiceNumber}</p><h3>{invoice.company}</h3><strong className="money">{formatNairaDecimal(invoice.amount)}</strong><Status value={invoice.status} />{invoice.paymentReference && <small>Reference: {invoice.paymentReference}</small>}</div>{invoice.status === "payment_submitted" ? <div className="payment-actions"><button className="small-primary" disabled={busyAction?.id === invoice.id || recovery.blocked} onClick={() => confirm(invoice)}>{busyAction?.id === invoice.id && busyAction?.action === "confirm" ? "Confirming…" : "Confirm payment"}</button><form className="inline-action" onSubmit={(event) => reject(event, invoice)}><input name="reason" aria-label={`Reason to reject ${invoice.invoiceNumber}`} placeholder="Rejection reason" disabled={busyAction?.id === invoice.id || recovery.blocked} required /><button className="danger-button" disabled={busyAction?.id === invoice.id || recovery.blocked}>{busyAction?.id === invoice.id && busyAction?.action === "reject" ? "Rejecting…" : "Reject payment"}</button></form></div> : <span className="muted-copy">No payment action is available until the Client submits a simulated payment.</span>}</article>)}</div> : <Empty text="No invoices have been issued yet." />}</section>;
}

function AuditView({ events }) {
  return <section className="content-card"><ViewIntro kicker="Role query" title="Security & Audit" description="Authenticated Administrator audit records for access, payment, approval, and workflow actions." />{events.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Entity</th><th>Outcome</th><th>When</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.action}</td><td>{event.actorName || "System"}<small>{event.actorRole}</small></td><td>{event.entityType} #{event.entityId}</td><td><Status value={event.outcome} /></td><td>{formatDate(event.occurredAt)}</td></tr>)}</tbody></table></div> : <Empty text="No audit events are available." />}</section>;
}

function NewServiceRequestView({ refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const recovery = useRefreshRecovery(refresh);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setOutcome(null); recovery.clear();
    const form = event.currentTarget;
    try { const result = await runMutationThenRefresh({ mutate: () => api("/requests", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }), refresh }); form.reset(); setOutcome({ type: "success", text: "Request submitted. Your ₦2,000 invoice is now Awaiting Payment." }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  return <section className="content-card form-view"><ViewIntro kicker="Start an engagement" title="New Service Request" description="Tell us what process you want to improve. Submission creates a linked ₦2,000 assessment invoice." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} /><form className="stack-form" onSubmit={submit}><Field label="Request title" name="title" /><label>Business process and expected outcome<textarea name="description" rows="6" required /></label><label>Priority<select name="priority" defaultValue="medium"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></label><button className="primary-button" disabled={busy || recovery.blocked}>{busy ? "Submitting request…" : "Submit Service Request"}</button></form></section>;
}

function ClientProjectsView({ requests, invoices }) {
  return <section className="content-card"><ViewIntro kicker="Commercial journey" title="My Projects" description="Track each request together with its linked invoice and approval status." />{requests.length ? <div className="project-grid">{requests.map((request) => { const invoice = invoices.find((item) => item.service_request_id === request.id); return <article className="project-card" key={request.id}><div className="card-heading"><span><p className="panel-kicker">REQ-{String(request.id).padStart(4, "0")}</p><h3>{request.title}</h3></span><Status value={request.status} /></div><p>{request.description}</p><dl><div><dt>Commercial status</dt><dd>{invoice ? statusLabel(invoice.status) : "Invoice unavailable"}</dd></div><div><dt>Invoice</dt><dd>{invoice ? `${invoice.invoiceNumber} · ${formatNaira(invoice.amount)}` : "Not linked"}</dd></div><div><dt>Assigned Staff</dt><dd>{request.staffName || "Assigned after approval"}</dd></div></dl></article>; })}</div> : <Empty text="No projects yet. Submit a New Service Request to begin." />}</section>;
}

function ClientInvoicesView({ invoices, refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const recovery = useRefreshRecovery(refresh);
  const pay = async (invoice) => {
    if (!window.confirm(`Simulate payment of ${formatNairaDecimal(invoice.amount)} for ${invoice.invoiceNumber}? This validation step does not collect real money.`)) return;
    setBusyId(invoice.id); setOutcome(null); recovery.clear();
    try { const result = await runMutationThenRefresh({ mutate: () => api(`/invoices/${invoice.id}/pay`, { method: "POST", body: "{}" }), refresh }); setOutcome({ type: "success", text: "Payment Submitted—Pending Admin Confirmation. Work cannot advance until an Administrator confirms it." }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusyId(null); }
  };
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId);
  return <div className="view-stack"><section className="content-card"><ViewIntro kicker="Commercial records" title="Invoices & Payments" description="View and save your invoice before simulated payment. Payment only unlocks Administrator review after confirmation; it never advances work directly." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} />{invoices.length ? <div className="payment-list">{invoices.map((invoice) => <article className="payment-card" key={invoice.id}><div><p className="panel-kicker">{invoice.invoiceNumber}</p><h3>{invoice.description}</h3><strong className="money">{formatNairaDecimal(invoice.amount)}</strong><Status value={invoice.status} />{invoice.rejectionReason && <small>Returned: {invoice.rejectionReason}</small>}</div><div className="payment-actions"><button className="outline-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>View invoice</button>{invoice.status === "unpaid" ? <button className="small-primary" disabled={busyId === invoice.id || recovery.blocked} onClick={() => pay(invoice)}>{busyId === invoice.id ? "Submitting…" : "Simulate payment ₦2,000.00"}</button> : <span className="muted-copy">{statusLabel(invoice.status)}. No further Client payment action is available.</span>}</div></article>)}</div> : <Empty text="No linked invoices are available." />}</section>{selectedInvoice && <InvoiceDetail invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} />}</div>;
}

function InvoiceDetail({ invoice, onClose }) {
  return <section className="invoice-print-area" aria-label={`Invoice ${invoice.invoiceNumber}`}><div className="invoice-actions"><button className="outline-button" type="button" onClick={onClose}>Back to invoices</button><button className="small-primary" type="button" onClick={() => window.print()}>Print / Save Invoice</button></div><article className="invoice-document"><header className="invoice-header"><div><p className="panel-kicker">AI-Powered Business Automation Services</p><h2>AMY Automation</h2></div><div><p className="panel-kicker">Invoice number</p><strong>{invoice.invoiceNumber}</strong></div></header><div className="invoice-meta"><div><span>Linked request</span><b>REQ-{String(invoice.service_request_id).padStart(4, "0")} · {invoice.description}</b></div><div><span>Client ID</span><b>{invoice.clientId}</b></div><div><span>Organization</span><b>{invoice.company}</b></div><div><span>Issue date</span><b>{formatDate(invoice.created_at)}</b></div><div><span>Payment status</span><Status value={invoice.status} /></div></div><table className="invoice-lines"><thead><tr><th>Service</th><th>Amount</th></tr></thead><tbody><tr><td><b>Service assessment</b><small>{invoice.description}</small></td><td>{formatNairaDecimal(invoice.amount)}</td></tr></tbody><tfoot><tr><th>Total</th><th>{formatNairaDecimal(invoice.amount)}</th></tr></tfoot></table><p className="invoice-note">This invoice can be viewed or saved before payment. Simulated payment validates the workflow only and does not collect real money.</p></article></section>;
}

function GuidedAgentView({ requests }) {
  const approvedRequests = requests.filter((request) => request.status === "approved");
  const [selectedRequestId, setSelectedRequestId] = useState(() => String(approvedRequests[0]?.id ?? ""));
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState(null);
  useEffect(() => {
    if (!selectedRequestId) { setPlan(null); return; }
    let current = true; setLoading(true); setOutcome(null);
    api(`/requests/${selectedRequestId}/agent`).then((nextPlan) => { if (current) setPlan(nextPlan); }).catch((error) => { if (current) setOutcome({ type: "error", text: error.message }); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedRequestId]);
  const toggleStep = async (step) => {
    setOutcome(null);
    try { const updated = await api(`/requests/${selectedRequestId}/agent/${step.key}`, { method: "PATCH", body: JSON.stringify({ completed: !step.completed }) }); setPlan(updated); setOutcome({ type: "success", text: "Guided Agent progress saved." }); }
    catch (error) { setOutcome({ type: "error", text: error.message }); }
  };
  if (!approvedRequests.length) return <section className="content-card locked-view"><span className="lock-mark">⌁</span><ViewIntro kicker="Approval required" title="Guided Agent locked" description="The Guided Agent becomes available only when a project reaches Approved—Agent Ready. Complete payment and wait for Administrator approval." /><div className="notice">Current workflow: Awaiting Payment → Pending Admin Confirmation → Pending Admin Approval → Approved—Agent Ready</div></section>;
  return <section className="content-card"><ViewIntro kicker="Request-derived delivery plan" title="Guided Agent" description="Follow the generated plan and save checklist progress against the approved request." /><label className="select-field">Approved project<select value={selectedRequestId} onChange={(event) => setSelectedRequestId(event.target.value)}>{approvedRequests.map((request) => <option value={request.id} key={request.id}>{request.title}</option>)}</select></label><ActionNotice outcome={outcome} />{loading ? <InlineLoading text="Preparing your request-derived plan…" /> : plan ? <div className="agent-layout"><div><div className="progress-heading"><span>Plan progress</span><b>{plan.completionPercentage}%</b></div><div className="progress-track"><span style={{ width: `${plan.completionPercentage}%` }} /></div>{plan.steps.map((step) => <label className={`agent-step ${step.completed ? "complete" : ""}`} key={step.key}><input type="checkbox" checked={step.completed} onChange={() => toggleStep(step)} /><span><small>{step.phase.replaceAll("-", " ")}</small><b>{step.title}</b><p>{step.description}</p></span></label>)}</div><aside className="agent-summary"><p className="panel-kicker">{plan.category}</p><h3>Next authorized action</h3><p>{plan.nextAction.action}</p><h3>Required information</h3>{plan.requiredInformation.map((item) => <div className="requirement-row" key={item.key}><span>{item.label}</span><b>{item.supplied ? "Supplied" : "Needed"}</b></div>)}</aside></div> : <Empty text="No Guided Agent plan could be loaded." />}</section>;
}

function AutomationPerformanceView({ requests }) {
  const approved = requests.filter((request) => request.status === "approved").length;
  return <div className="view-stack"><section className="metric-grid"><Metric label="Approved automations" value={approved} trend="Agent ready" /><Metric label="In commercial review" value={requests.length - approved} trend="Protected gates" /><Metric label="Monitored workflows" value={Math.max(approved, 0)} trend="Live" /><Metric label="Reported incidents" value="0" trend="Stable" /></section><section className="content-card"><ViewIntro kicker="Outcome monitoring" title="Automation Performance" description="Performance monitoring starts after an approved automation enters delivery." />{approved ? <div className="health-row"><span>Approved projects available for monitored delivery</span><b className="good">{approved}</b></div> : <Empty text="No automation is approved for performance monitoring yet." />}</section></div>;
}

function SupportCasesView({ tickets, role, refresh }) {
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const recovery = useRefreshRecovery(refresh);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setOutcome(null); recovery.clear();
    const form = event.currentTarget;
    try { const result = await runMutationThenRefresh({ mutate: () => api("/tickets", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }), refresh }); form.reset(); setOutcome({ type: "success", text: "Support case opened. Our team will respond shortly." }); recovery.capture(result); }
    catch (error) { setOutcome({ type: "error", text: error.message }); } finally { setBusy(false); }
  };
  return <div className={role === "client" ? "split-view" : "view-stack"}><section className="content-card"><ViewIntro kicker="Role query" title="Support Cases" description="Cases returned by the authenticated, role-scoped support query." />{tickets.length ? tickets.map((ticket) => <div className="list-row" key={ticket.id}><span><b>{ticket.subject}</b><small>{ticket.company || ticket.priority} · {ticket.detail}</small></span><Status value={ticket.status} /></div>) : <Empty text="No support cases require attention." />}</section>{role === "client" && <section className="content-card"><ViewIntro kicker="Authorized action" title="Open a support case" description="Describe the issue and its operational impact." /><ActionNotice outcome={outcome} /><RefreshNotice recovery={recovery} /><form className="stack-form" onSubmit={submit}><Field label="Issue subject" name="subject" /><label>Issue details<textarea name="detail" rows="5" required /></label><label>Priority<select name="priority" defaultValue="medium"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></label><button className="primary-button" disabled={busy || recovery.blocked}>{busy ? "Opening case…" : "Open Support Case"}</button></form></section>}</div>;
}

function OrganizationPrivacyView({ organization, user }) {
  if (!organization) return <section className="content-card"><Empty text="Organization profile is unavailable." /></section>;
  return <div className="split-view"><section className="content-card"><ViewIntro kicker="Organization profile" title={organization.company} description="Your authenticated organization boundary and account details." /><dl className="details-list"><div><dt>Client ID</dt><dd>{organization.clientId}</dd></div><div><dt>Account owner</dt><dd>{user.fullName}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Location</dt><dd>{organization.state}, {organization.lga}</dd></div></dl></section><section className="content-card"><ViewIntro kicker="Privacy boundary" title="Your data stays scoped" description="Requests, invoices, support cases, and Guided Agent plans are queried only for your organization." /><div className="privacy-points"><p>✓ Role-based authenticated access</p><p>✓ Organization-scoped commercial records</p><p>✓ Audited payment and approval actions</p><p>✓ No work advancement from hidden UI controls</p></div></section></div>;
}

function StaffWorkView({ title, description, requests }) {
  return <section className="content-card"><ViewIntro kicker="Assignment-scoped delivery" title={title} description={description} /><RequestList rows={requests} /></section>;
}

function KnowledgeTrainingView() {
  return <section className="content-card"><ViewIntro kicker="Delivery enablement" title="Knowledge & Training" description="Reference material for secure, consistent automation delivery." /><div className="record-grid"><ServiceCard title="Assessment standard" price="Guide 01" text="Capture current process, owners, inputs, systems, volume, and success criteria." /><ServiceCard title="Testing standard" price="Guide 02" text="Validate expected outcomes, invalid inputs, exception handling, and rollback readiness." /><ServiceCard title="Secure handover" price="Guide 03" text="Document ownership, access, monitoring, and escalation before deployment." /></div></section>;
}

function RequestList({ rows }) {
  if (!rows.length) return <Empty text="No service requests are available in this workspace." />;
  return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Organization</th><th>Priority</th><th>Status</th></tr></thead><tbody>{rows.map((request) => <tr key={request.id}><td><b>{request.title}</b><small>REQ-{String(request.id).padStart(4, "0")}</small></td><td>{request.company}</td><td>{request.priority}</td><td><Status value={request.status} /></td></tr>)}</tbody></table></div>;
}

const statusCopy = {
  awaiting_payment: "Awaiting Payment",
  unpaid: "Awaiting Payment",
  payment_pending_confirmation: "Payment Submitted—Pending Admin Confirmation",
  payment_submitted: "Pending Admin Confirmation",
  pending_admin_approval: "Pending Admin Approval",
  approved: "Approved—Agent Ready",
};

function statusLabel(value) { return statusCopy[value] ?? String(value ?? "Unknown").replaceAll("_", " "); }
function formatNaira(value) { return `₦${Number(value ?? 0).toLocaleString("en-NG")}`; }
function formatNairaDecimal(value) { return `₦${Number(value ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatDate(value) { return value ? new Date(`${String(value).replace(" ", "T")}Z`).toLocaleString("en-NG") : "Not recorded"; }
function Metric({ label, value, trend }) { return <article className="metric-card"><div><span>{label}</span><strong>{String(value).padStart(2, "0")}</strong></div><small><i /> {trend}</small></article>; }
function Status({ value }) { return <span className={`status ${value}`}>{statusLabel(value)}</span>; }
function Empty({ text }) { return <div className="empty-state"><span>◇</span><p>{text}</p></div>; }
function ActionNotice({ outcome }) { return outcome ? <div className={`notice ${outcome.type}`} role={outcome.type === "error" ? "alert" : "status"}>{outcome.text}</div> : null; }
function useRefreshRecovery(refresh) {
  const [issue, setIssue] = useState("");
  const [retrying, setRetrying] = useState(false);
  const clear = () => setIssue("");
  const capture = (result) => setIssue(result.refreshError?.message ?? "");
  const retry = async () => { setRetrying(true); try { await refresh(); setIssue(""); } catch (error) { setIssue(error.message); } finally { setRetrying(false); } };
  return { issue, blocked: Boolean(issue), retrying, clear, capture, retry };
}
function RefreshNotice({ recovery }) { return recovery.issue ? <div className="notice warning" role="alert"><b>Saved successfully, but current data could not be refreshed.</b><span>{recovery.issue}</span><button className="text-button" type="button" disabled={recovery.retrying} onClick={recovery.retry}>{recovery.retrying ? "Retrying refresh…" : "Retry refresh"}</button></div> : null; }
function InlineLoading({ text }) { return <div className="inline-loading" role="status"><span className="spinner" />{text}</div>; }
