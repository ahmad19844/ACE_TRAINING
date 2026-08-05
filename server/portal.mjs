import { openDatabase } from "./database.mjs";
import { createOpaqueToken, digestToken, hashPassword, validatePassword, verifyPassword } from "./security.mjs";

const DEFAULT_ADMIN_PASSWORD = "Pa$$w0rd1177";
const CATEGORY_GUIDANCE = {
  "invoice/document": {
    work: "supplier invoice and document workflow",
    inputs: "representative supplier invoices or documents, required fields, and document-system access",
    workflow: "extract fields, validate confidence, and route exceptions to finance",
    testing: "field accuracy, duplicate documents, and unreadable-file exceptions",
    handover: "finance or document-processing owner",
  },
  "customer support": {
    work: "customer support triage workflow",
    inputs: "sample customer messages or support tickets, queue rules, and help-desk access",
    workflow: "classify intent, assign the right queue, and escalate urgent cases",
    testing: "routing accuracy, priority escalation, and unresolved-ticket exceptions",
    handover: "support operations owner",
  },
  "reporting/data": {
    work: "reporting and data workflow",
    inputs: "sample data exports, metric definitions, and reporting-system access",
    workflow: "validate source data, calculate agreed metrics, and publish the reporting view",
    testing: "metric accuracy, late-data handling, and dashboard refresh exceptions",
    handover: "reporting or data owner",
  },
  communications: {
    work: "communications workflow",
    inputs: "sample messages, approved templates, recipient rules, and messaging-system access",
    workflow: "select recipients, personalize approved content, and record delivery outcomes",
    testing: "recipient selection, template rendering, and failed-delivery exceptions",
    handover: "communications owner",
  },
  "general automation": {
    work: "automation workflow",
    inputs: "representative inputs, business rules, and system access",
    workflow: "apply the agreed rules, route exceptions, and record outcomes",
    testing: "expected outcomes, invalid inputs, and exception handling",
    handover: "process owner",
  },
};

const REQUIRED_INFORMATION = [
  { key: "process-owner", label: "Process owner", pattern: /\b(owner|stakeholder|team|department|manager|lead|supervisor)\b/i },
  { key: "sample-inputs", label: "Sample inputs", pattern: /\b(sample|example|attached|attachment|csv|spreadsheet|export|test data)\b/i },
  { key: "systems-integrations", label: "Systems or integrations", pattern: /\b(system|integration|api|erp|crm|database|dashboard|help.?desk|email platform|portal)\b/i },
  { key: "volume-frequency", label: "Volume or frequency", pattern: /\b\d+\b|\b(daily|weekly|monthly|quarterly|hourly|per day|per week|volume)\b/i },
  { key: "success-criteria", label: "Success criteria", pattern: /\b(success|target|accuracy|sla|within|reduce|increase|faster|less than)\b/i },
  { key: "data-sensitivity", label: "Data sensitivity", pattern: /\b(sensitive|confidential|personal|pii|financial|payment|health|private)\b/i },
];

function stableAgentFingerprint(values) {
  let hash = 2166136261;
  for (const character of values.join("\u001f").toLowerCase().trim()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function agentKeyPart(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general";
}

function agentCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (/invoice|document|receipt|contract|form/.test(text)) return "invoice/document";
  if (/customer|support|ticket|complaint|help desk/.test(text)) return "customer support";
  if (/report|data|dashboard|analytics|metric/.test(text)) return "reporting/data";
  if (/email|message|notification|communication|sms/.test(text)) return "communications";
  return "general automation";
}

function agentSteps(request, category) {
  const guidance = CATEGORY_GUIDANCE[category];
  const fingerprint = stableAgentFingerprint([request.organization_name, request.title, request.description, request.priority, category]);
  const keyPrefix = `${agentKeyPart(category)}-${agentKeyPart(request.priority)}-${fingerprint}`;
  const context = `${request.priority} priority ${guidance.work}`;
  const definitions = [
    { phase: "discovery", title: `Discover ${guidance.work}`, description: `Meet ${request.organization_name} to map the current process for ${request.title} and confirm the ${context}.` },
    { phase: "required-data-input", title: `Gather ${guidance.work} inputs`, description: `Collect ${guidance.inputs} for ${request.title}.` },
    { phase: "workflow-design", title: `Design ${guidance.work}`, description: `For this ${context}, ${guidance.workflow}.` },
    { phase: "testing", title: `Test ${guidance.work}`, description: `Validate ${guidance.testing} against the intended outcome: ${request.description}` },
    { phase: "handover", title: `Hand over ${guidance.work}`, description: `Document ownership, monitoring, and exception handling with the ${guidance.handover} at ${request.organization_name}.` },
  ];
  return definitions.map((step) => ({ ...step, key: `${keyPrefix}-${step.phase}` }));
}

function publicUser(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    role: row.role,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    mustChangePassword: Boolean(row.must_change_password),
    status: row.status,
  };
}

export function createPortal({ databasePath = "./data/portal.sqlite" } = {}) {
  const db = openDatabase(databasePath);
  const admin = db.prepare("SELECT id FROM users WHERE username = ?").get("admin_control");
  if (!admin) {
    db.prepare(`INSERT INTO users(role, username, full_name, password_hash, must_change_password)
      VALUES('admin', ?, 'System Administrator', ?, 1)`).run("admin_control", hashPassword(DEFAULT_ADMIN_PASSWORD));
  }

  const audit = (actorId, action, entityType, entityId, outcome = "success", detail = null) => {
    db.prepare(`INSERT INTO audit_events(actor_id, action, entity_type, entity_id, outcome, detail)
      VALUES(?,?,?,?,?,?)`).run(actorId ?? null, action, entityType, entityId == null ? null : String(entityId), outcome, detail);
  };

  const inImmediateTransaction = (work) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const requireOneChange = (result, message) => {
    if (result.changes !== 1) throw new Error(message);
  };

  const findInvoiceAndRequest = (invoiceId) => db.prepare(`SELECT i.*, r.status request_status,
    r.organization_id request_organization_id FROM invoices i
    JOIN service_requests r ON r.id=i.service_request_id WHERE i.id=?`).get(invoiceId);

  const invoiceFields = `i.*, i.invoice_number invoiceNumber, i.payment_reference paymentReference,
    i.payment_submitted_at paymentSubmittedAt, i.rejection_reason rejectionReason,
    i.confirmed_at confirmedAt, i.confirmed_by confirmedBy, o.client_id clientId,
    o.name company, confirmer.full_name confirmedByName, r.organization_id requestOrganizationId`;
  const invoiceJoin = ` FROM invoices i JOIN service_requests r ON r.id=i.service_request_id
    JOIN organizations o ON o.id=i.organization_id
    LEFT JOIN users confirmer ON confirmer.id=i.confirmed_by`;
  const organizationFields = `id, client_id clientId, name company, phone, state, lga, status,
    created_at createdAt`;
  const staffFields = `u.id, u.full_name fullName, u.email, u.status, p.specialty, p.availability`;

  const listOrganizations = (organizationId = null) => organizationId == null
    ? db.prepare(`SELECT ${organizationFields} FROM organizations ORDER BY id DESC`).all()
    : db.prepare(`SELECT ${organizationFields} FROM organizations WHERE id=?`).all(organizationId);
  const listStaff = (activeOnly = false) => db.prepare(`SELECT ${staffFields} FROM users u
    JOIN staff_profiles p ON p.user_id=u.id WHERE u.role='staff'${activeOnly ? " AND u.status='active'" : ""} ORDER BY u.full_name`).all();

  const agentRequest = (requestId) => db.prepare(`SELECT r.*, o.client_id organization_client_id,
    o.name organization_name, o.phone organization_phone, o.state organization_state, o.lga organization_lga
    FROM service_requests r JOIN organizations o ON o.id=r.organization_id WHERE r.id=?`).get(requestId);

  const requireAgentAccess = (token, requestId) => {
    const { user } = requireSession(token);
    if (user.mustChangePassword) throw new Error("You must change your password before continuing");
    const request = agentRequest(requestId);
    if (!request) throw new Error("Request not found");
    if (user.role === "client" && request.organization_id !== user.organizationId) {
      audit(user.id, "authorization.denied", "service_request", requestId, "denied");
      throw new Error("You are not authorized to access this request");
    }
    if (user.role === "staff" && request.assigned_staff_id !== user.id) {
      audit(user.id, "authorization.denied", "service_request", requestId, "denied");
      throw new Error("You are not assigned to this request");
    }
    if (request.status !== "approved") throw new Error("The guided agent is available only after the request is approved");
    return { user, request };
  };

  const buildAgentPlan = (user, request) => {
    const progress = db.prepare(`SELECT step_key, completed FROM agent_step_progress
      WHERE organization_id=? AND service_request_id=?`).all(request.organization_id, request.id);
    const completedByKey = new Map(progress.map((row) => [row.step_key, Boolean(row.completed)]));
    const category = agentCategory(request.title, request.description);
    const steps = agentSteps(request, category).map((step) => ({ ...step, completed: completedByKey.get(step.key) ?? false }));
    const requiredInformation = REQUIRED_INFORMATION.map((item) => ({
      key: item.key,
      label: item.label,
      supplied: item.pattern.test(`${request.title} ${request.description}`),
    }));
    const missingInformation = requiredInformation.filter((item) => !item.supplied);
    const completedCount = steps.filter((step) => step.completed).length;
    const nextStep = steps.find((step) => !step.completed) ?? null;
    const missingAction = missingInformation.length
      ? `Provide missing implementation inputs: ${missingInformation.map((item) => item.label).join(", ")}.`
      : null;
    const nextAction = user.role === "client"
      ? { role: "client", action: missingAction ?? (nextStep ? `Review ${nextStep.title.toLowerCase()} with the assigned team.` : "Review the completed handover.") }
      : user.role === "staff"
        ? { role: "staff", action: missingAction ? `Request these inputs from the Client: ${missingInformation.map((item) => item.label).join(", ")}.` : (nextStep ? `Complete ${nextStep.title.toLowerCase()} for this request.` : "Review the completed handover with the client.") }
        : { role: "admin", action: missingAction ? `Monitor collection of: ${missingInformation.map((item) => item.label).join(", ")}.` : (nextStep ? `Monitor progress on ${nextStep.title.toLowerCase()}.` : "Review the completed plan and handover.") };
    return {
      request: {
        id: request.id, title: request.title, description: request.description, priority: request.priority,
        status: request.status, expectedOutcome: request.description,
      },
      organization: {
        id: request.organization_id, clientId: request.organization_client_id, company: request.organization_name,
        phone: request.organization_phone, state: request.organization_state, lga: request.organization_lga,
      },
      category,
      steps,
      requiredInformation,
      missingInformation,
      completionPercentage: Math.round((completedCount / steps.length) * 100),
      nextStep,
      nextAction,
    };
  };

  function requireSession(token, expectedRole) {
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP AND u.status='active'`).get(digestToken(token ?? ""));
    if (!row) throw new Error("Authentication required");
    if (expectedRole && row.role !== expectedRole) {
      audit(row.id, "authorization.denied", "role", expectedRole, "denied");
      throw new Error("You are not authorized to perform this action");
    }
    return { user: publicUser(row) };
  }

  return {
    db,
    close: () => db.close(),
    requireSession,
    async registerClient(input) {
      const required = ["fullName", "email", "phone", "state", "lga", "company", "password"];
      if (required.some((key) => !String(input[key] ?? "").trim())) throw new Error("All registration fields are required");
      if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new Error("Enter a valid email address");
      if (!validatePassword(input.password).valid) throw new Error("Password does not meet the required policy");
      const email = input.email.trim().toLowerCase();
      if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new Error("An account with this email already exists");
      db.exec("BEGIN IMMEDIATE");
      try {
        const sequence = db.prepare("SELECT next_value FROM client_sequence WHERE singleton=1").get().next_value;
        const clientId = `AMY${String(sequence).padStart(3, "0")}`;
        db.prepare("UPDATE client_sequence SET next_value=next_value+1 WHERE singleton=1").run();
        const org = db.prepare(`INSERT INTO organizations(client_id,name,phone,state,lga) VALUES(?,?,?,?,?)`)
          .run(clientId, input.company.trim(), input.phone.trim(), input.state.trim(), input.lga.trim());
        const user = db.prepare(`INSERT INTO users(organization_id,role,email,full_name,password_hash) VALUES(?,'client',?,?,?)`)
          .run(org.lastInsertRowid, email, input.fullName.trim(), hashPassword(input.password));
        audit(user.lastInsertRowid, "client.registered", "organization", org.lastInsertRowid);
        db.exec("COMMIT");
        return { clientId, fullName: input.fullName.trim(), email, company: input.company.trim() };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    getClientById(clientId) {
      const row = db.prepare(`SELECT o.*, u.full_name, u.email FROM organizations o
        JOIN users u ON u.organization_id=o.id AND u.role='client' WHERE o.client_id=?`).get(clientId);
      return row ? { clientId: row.client_id, company: row.name, fullName: row.full_name, email: row.email, state: row.state, lga: row.lga } : null;
    },
    async login({ role, identity, password }) {
      const normalized = String(identity ?? "").trim().toLowerCase();
      const row = role === "admin"
        ? db.prepare("SELECT * FROM users WHERE role=? AND lower(username)=?").get(role, normalized)
        : db.prepare("SELECT * FROM users WHERE role=? AND lower(email)=?").get(role, normalized);
      if (!row || row.status !== "active" || !verifyPassword(password ?? "", row.password_hash)) {
        audit(row?.id, "auth.login", "user", row?.id, "denied");
        throw new Error("Invalid credentials");
      }
      const token = createOpaqueToken();
      const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)").run(row.id, digestToken(token), expires);
      audit(row.id, "auth.login", "user", row.id);
      const user = publicUser(row);
      return { token, user, next: user.mustChangePassword ? "change-password" : `${user.role}-dashboard` };
    },
    getOrganizationForSession(token, clientId) {
      const { user } = requireSession(token, "client");
      const row = db.prepare("SELECT * FROM organizations WHERE client_id=?").get(clientId);
      if (!row || row.id !== user.organizationId) {
        audit(user.id, "authorization.denied", "organization", clientId, "denied");
        throw new Error("You are not authorized to view this organization");
      }
      return { clientId: row.client_id, company: row.name, state: row.state, lga: row.lga };
    },
    changePassword(token, nextPassword, currentPassword) {
      const { user } = requireSession(token);
      const row = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
      if (!verifyPassword(currentPassword ?? "", row.password_hash)) throw new Error("Current password is incorrect");
      if (!validatePassword(nextPassword).valid) throw new Error("New password does not meet the required policy");
      if (verifyPassword(nextPassword, row.password_hash) || nextPassword === DEFAULT_ADMIN_PASSWORD) throw new Error("Choose a different password");
      db.prepare("UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?").run(hashPassword(nextPassword), user.id);
      audit(user.id, "auth.password_changed", "user", user.id);
      return { success: true };
    },
    getDashboard(token) {
      const { user } = requireSession(token);
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      const requests = user.role === "admin" ? db.prepare("SELECT COUNT(*) count FROM service_requests").get().count
        : user.role === "client" ? db.prepare("SELECT COUNT(*) count FROM service_requests WHERE organization_id=?").get(user.organizationId).count
        : db.prepare("SELECT COUNT(*) count FROM service_requests WHERE assigned_staff_id=?").get(user.id).count;
      const tickets = user.role === "admin" ? db.prepare("SELECT COUNT(*) count FROM support_tickets").get().count
        : user.role === "client" ? db.prepare("SELECT COUNT(*) count FROM support_tickets WHERE organization_id=?").get(user.organizationId).count
        : db.prepare("SELECT COUNT(*) count FROM support_tickets WHERE assigned_staff_id=?").get(user.id).count;
      const organizationCount = user.role === "admin" ? db.prepare("SELECT COUNT(*) count FROM organizations").get().count : user.role === "client" ? 1 : 0;
      const staff = user.role === "admin" ? db.prepare("SELECT COUNT(*) count FROM users WHERE role='staff'").get().count : 0;
      const organizations = user.role === "admin" ? listOrganizations() : user.role === "client" ? listOrganizations(user.organizationId) : [];
      const staffMembers = user.role === "admin" ? listStaff() : [];
      const agentAvailability = user.role === "client" ? listStaff(true) : [];
      const auditEvents = user.role === "admin" ? db.prepare(`SELECT e.id, e.action, e.entity_type entityType,
        e.entity_id entityId, e.outcome, e.detail, e.created_at occurredAt, actor.id actorId,
        actor.full_name actorName, actor.role actorRole FROM audit_events e
        LEFT JOIN users actor ON actor.id=e.actor_id ORDER BY e.id DESC`).all() : undefined;
      return {
        role: user.role, user, metrics: { organizations: organizationCount, staff, requests, tickets },
        organizations, requests: this.listRequests(token), tickets: this.listTickets(token),
        invoices: this.listInvoices(token), staffMembers, agentAvailability, auditEvents,
      };
    },
    createStaff(token, input) {
      const { user } = requireSession(token, "admin");
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      if (!input.fullName || !input.email || !input.specialty || !validatePassword(input.password).valid) throw new Error("Valid staff details and password are required");
      const result = db.prepare(`INSERT INTO users(role,email,full_name,password_hash) VALUES('staff',?,?,?)`)
        .run(input.email.trim().toLowerCase(), input.fullName.trim(), hashPassword(input.password));
      db.prepare("INSERT INTO staff_profiles(user_id,specialty) VALUES(?,?)").run(result.lastInsertRowid, input.specialty.trim());
      audit(user.id, "staff.created", "user", result.lastInsertRowid);
      return { id: Number(result.lastInsertRowid), fullName: input.fullName, email: input.email, specialty: input.specialty };
    },
    createServiceRequest(token, input) {
      const { user } = requireSession(token, "client");
      if (!input.title?.trim() || !input.description?.trim()) throw new Error("Title and description are required");
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db.prepare(`INSERT INTO service_requests(organization_id,created_by,title,description,priority,status) VALUES(?,?,?,?,?,'awaiting_payment')`)
          .run(user.organizationId, user.id, input.title.trim(), input.description.trim(), input.priority ?? "medium");
        const requestId = Number(result.lastInsertRowid);
        const invoice = db.prepare(`INSERT INTO invoices(organization_id,service_request_id,invoice_number,description,amount,status,due_date)
          VALUES(?,?,?,?,2000,'unpaid',DATE('now','+7 days'))`)
          .run(user.organizationId, requestId, `INV-${String(requestId).padStart(6, "0")}`, input.title.trim());
        audit(user.id, "service_request.submitted", "service_request", requestId);
        audit(user.id, "invoice.generated", "invoice", invoice.lastInsertRowid, "success", `Service request ${requestId}`);
        db.exec("COMMIT");
        return db.prepare("SELECT * FROM service_requests WHERE id=?").get(requestId);
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    submitPayment(token, invoiceId) {
      const { user } = requireSession(token, "client");
      const reference = `PAY-${createOpaqueToken()}`;
      return inImmediateTransaction(() => {
        const invoice = findInvoiceAndRequest(invoiceId);
        if (!invoice) throw new Error("Invoice not found");
        if (invoice.organization_id !== user.organizationId || invoice.request_organization_id !== user.organizationId || invoice.organization_id !== invoice.request_organization_id) {
          throw new Error("You are not authorized to submit payment for this invoice");
        }
        if (invoice.status !== "unpaid" || invoice.request_status !== "awaiting_payment") throw new Error("Invoice is not awaiting payment submission");
        requireOneChange(db.prepare(`UPDATE invoices SET status='payment_submitted', payment_reference=?, payment_submitted_at=CURRENT_TIMESTAMP,
          rejection_reason=NULL WHERE id=? AND organization_id=? AND status='unpaid'`).run(reference, invoiceId, user.organizationId), "Invoice is not awaiting payment submission");
        requireOneChange(db.prepare(`UPDATE service_requests SET status='payment_pending_confirmation', updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND organization_id=? AND status='awaiting_payment'`).run(invoice.service_request_id, user.organizationId), "Invoice is not awaiting payment submission");
        audit(user.id, "payment.submitted", "invoice", invoiceId, "success", reference);
        return db.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
      });
    },
    rejectPayment(token, invoiceId, reason) {
      const { user } = requireSession(token, "admin");
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      const detail = String(reason ?? "").trim();
      if (!detail) throw new Error("A rejection reason is required");
      return inImmediateTransaction(() => {
        const invoice = findInvoiceAndRequest(invoiceId);
        if (!invoice) throw new Error("Invoice not found");
        if (invoice.organization_id !== invoice.request_organization_id) throw new Error("Invoice and request organizations do not match");
        if (invoice.status !== "payment_submitted" || invoice.request_status !== "payment_pending_confirmation") throw new Error("Invoice payment is not awaiting confirmation");
        requireOneChange(db.prepare(`UPDATE invoices SET status='unpaid', rejection_reason=?, confirmed_at=NULL, confirmed_by=NULL
          WHERE id=? AND organization_id=? AND status='payment_submitted'`).run(detail, invoiceId, invoice.organization_id), "Invoice payment is not awaiting confirmation");
        requireOneChange(db.prepare(`UPDATE service_requests SET status='awaiting_payment', updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND organization_id=? AND status='payment_pending_confirmation'`).run(invoice.service_request_id, invoice.request_organization_id), "Invoice payment is not awaiting confirmation");
        audit(user.id, "payment.rejected", "invoice", invoiceId, "success", detail);
        return db.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
      });
    },
    confirmPayment(token, invoiceId) {
      const { user } = requireSession(token, "admin");
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      return inImmediateTransaction(() => {
        const invoice = findInvoiceAndRequest(invoiceId);
        if (!invoice) throw new Error("Invoice not found");
        if (invoice.organization_id !== invoice.request_organization_id) throw new Error("Invoice and request organizations do not match");
        if (invoice.status !== "payment_submitted" || invoice.request_status !== "payment_pending_confirmation") throw new Error("Invoice payment is not awaiting confirmation");
        requireOneChange(db.prepare(`UPDATE invoices SET status='paid', confirmed_at=CURRENT_TIMESTAMP, confirmed_by=?, rejection_reason=NULL
          WHERE id=? AND organization_id=? AND status='payment_submitted'`).run(user.id, invoiceId, invoice.organization_id), "Invoice payment is not awaiting confirmation");
        requireOneChange(db.prepare(`UPDATE service_requests SET status='pending_admin_approval', updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND organization_id=? AND status='payment_pending_confirmation'`).run(invoice.service_request_id, invoice.request_organization_id), "Invoice payment is not awaiting confirmation");
        audit(user.id, "payment.confirmed", "invoice", invoiceId);
        return db.prepare("SELECT * FROM invoices WHERE id=?").get(invoiceId);
      });
    },
    approvePaidRequest(token, requestId, staffId = null) {
      const { user } = requireSession(token, "admin");
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      return inImmediateTransaction(() => {
        const request = db.prepare(`SELECT r.*, i.id invoice_id, i.status invoice_status,
          i.organization_id invoice_organization_id FROM service_requests r
          JOIN invoices i ON i.service_request_id=r.id WHERE r.id=?`).get(requestId);
        if (!request) throw new Error("Request not found");
        if (request.organization_id !== request.invoice_organization_id) throw new Error("Invoice and request organizations do not match");
        if (request.status !== "pending_admin_approval" || request.invoice_status !== "paid") throw new Error("Request is not pending approval with a paid invoice");
        if (staffId != null) {
          const staff = db.prepare("SELECT id FROM users WHERE id=? AND role='staff' AND status='active'").get(staffId);
          if (!staff) throw new Error("Assign an active Staff member");
        }
        requireOneChange(db.prepare(`UPDATE service_requests SET status='approved', assigned_staff_id=COALESCE(?, assigned_staff_id),
          updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='pending_admin_approval'`).run(staffId, requestId, request.organization_id), "Request is not pending approval with a paid invoice");
        audit(user.id, "service_request.approved", "service_request", requestId);
        return db.prepare("SELECT * FROM service_requests WHERE id=?").get(requestId);
      });
    },
    getAgentPlan(token, requestId) {
      const { user, request } = requireAgentAccess(token, requestId);
      return buildAgentPlan(user, request);
    },
    updateAgentStep(token, requestId, stepKey, completed) {
      const { user, request } = requireAgentAccess(token, requestId);
      if (!agentSteps(request, agentCategory(request.title, request.description)).some((step) => step.key === stepKey)) throw new Error("Unknown guided-agent step");
      if (typeof completed !== "boolean") throw new Error("Guided-agent step completion must be true or false");
      return inImmediateTransaction(() => {
        db.prepare(`INSERT INTO agent_step_progress(organization_id, service_request_id, step_key, completed, completed_by)
          VALUES(?,?,?,?,?) ON CONFLICT(organization_id, service_request_id, step_key) DO UPDATE SET
          completed=excluded.completed, completed_by=excluded.completed_by, updated_at=CURRENT_TIMESTAMP`)
          .run(request.organization_id, request.id, stepKey, Number(completed), user.id);
        audit(user.id, "agent.step_progress_updated", "service_request", request.id, "success", `${stepKey}:${completed}`);
        return buildAgentPlan(user, request);
      });
    },
    transitionRequest(token, requestId, nextStatus, data = {}) {
      const { user } = requireSession(token);
      if (user.mustChangePassword) throw new Error("You must change your password before continuing");
      const request = db.prepare("SELECT * FROM service_requests WHERE id=?").get(requestId);
      if (!request) throw new Error("Request not found");
      const transitions = { submitted: { admin_reviewed: "admin" }, admin_reviewed: { assessed: "staff" }, assessed: { client_confirmed: "client" }, client_confirmed: { active: "admin" } };
      if (transitions[request.status]?.[nextStatus] !== user.role) throw new Error("This transition is not permitted");
      if (user.role === "client" && request.organization_id !== user.organizationId) throw new Error("You are not authorized");
      if (user.role === "staff" && request.assigned_staff_id !== user.id) throw new Error("You are not assigned to this request");
      if (nextStatus === "admin_reviewed" && !data.staffId) throw new Error("Assign a Staff member before review");
      db.prepare(`UPDATE service_requests SET status=?, assigned_staff_id=COALESCE(?,assigned_staff_id), last_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(nextStatus, data.staffId ?? null, data.note ?? null, requestId);
      audit(user.id, `service_request.${nextStatus}`, "service_request", requestId);
      return db.prepare("SELECT * FROM service_requests WHERE id=?").get(requestId);
    },
    listRequests(token) {
      const { user } = requireSession(token);
      const fields = `r.*, o.client_id clientId, o.name company, u.id staffId, u.full_name staff_name,
        u.full_name staffName, u.email staffEmail`;
      if (user.role === "admin") return db.prepare(`SELECT ${fields} FROM service_requests r
        JOIN organizations o ON o.id=r.organization_id LEFT JOIN users u ON u.id=r.assigned_staff_id ORDER BY r.id DESC`).all();
      if (user.role === "client") return db.prepare(`SELECT ${fields} FROM service_requests r
        JOIN organizations o ON o.id=r.organization_id LEFT JOIN users u ON u.id=r.assigned_staff_id
        WHERE r.organization_id=? ORDER BY r.id DESC`).all(user.organizationId);
      return db.prepare(`SELECT ${fields} FROM service_requests r JOIN organizations o ON o.id=r.organization_id
        LEFT JOIN users u ON u.id=r.assigned_staff_id WHERE r.assigned_staff_id=? ORDER BY r.id DESC`).all(user.id);
    },
    createTicket(token, input) {
      const { user } = requireSession(token, "client");
      if (!input.subject?.trim() || !input.detail?.trim()) throw new Error("Subject and issue details are required");
      const result = db.prepare(`INSERT INTO support_tickets(organization_id,created_by,subject,detail,priority) VALUES(?,?,?,?,?)`).run(user.organizationId,user.id,input.subject.trim(),input.detail.trim(),input.priority??"medium");
      audit(user.id,"support.opened","support_ticket",result.lastInsertRowid);
      return db.prepare("SELECT * FROM support_tickets WHERE id=?").get(result.lastInsertRowid);
    },
    listTickets(token) {
      const { user } = requireSession(token);
      const fields = "t.*,o.client_id clientId,o.name company";
      if (user.role === "admin") return db.prepare(`SELECT ${fields} FROM support_tickets t JOIN organizations o ON o.id=t.organization_id ORDER BY t.id DESC`).all();
      if (user.role === "client") return db.prepare(`SELECT ${fields} FROM support_tickets t JOIN organizations o ON o.id=t.organization_id WHERE t.organization_id=? ORDER BY t.id DESC`).all(user.organizationId);
      return db.prepare(`SELECT ${fields} FROM support_tickets t JOIN organizations o ON o.id=t.organization_id WHERE t.assigned_staff_id=? ORDER BY t.id DESC`).all(user.id);
    },
    listInvoices(token) {
      const { user } = requireSession(token);
      if (user.role === "staff") return [];
      if (user.role === "admin") return db.prepare(`SELECT ${invoiceFields}${invoiceJoin} ORDER BY i.id DESC`).all();
      return db.prepare(`SELECT ${invoiceFields}${invoiceJoin} WHERE i.organization_id=? AND r.organization_id=?
        AND i.organization_id=r.organization_id ORDER BY i.id DESC`).all(user.organizationId, user.organizationId);
    },
    getInvoice(token, invoiceId) {
      const { user } = requireSession(token);
      if (user.role === "staff") {
        audit(user.id, "authorization.denied", "invoice", invoiceId, "denied");
        throw new Error("You are not authorized to view this invoice");
      }
      const invoice = db.prepare(`SELECT ${invoiceFields}${invoiceJoin} WHERE i.id=?`).get(invoiceId);
      if (!invoice) throw new Error("Invoice not found");
      if (user.role === "client" && (invoice.organization_id !== user.organizationId
        || invoice.requestOrganizationId !== user.organizationId
        || invoice.organization_id !== invoice.requestOrganizationId)) {
        audit(user.id, "authorization.denied", "invoice", invoiceId, "denied");
        throw new Error("You are not authorized to view this invoice");
      }
      return invoice;
    },
  };
}
