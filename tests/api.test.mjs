import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startServer } from "../server/index.mjs";

test("HTTP API registers and authenticates a client using an HttpOnly session cookie", { concurrency: true }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "amy-api-"));
  const running = await startServer({ port: 0, databasePath: join(directory, "api.sqlite") });
  t.after(async () => { await running.close(); rmSync(directory, { recursive: true, force: true }); });
  const registration = await fetch(`${running.url}/api/auth/register`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ fullName:"Ada Okafor", email:"ada@example.com", phone:"0801", state:"Lagos", lga:"Ikeja", company:"Ada Logistics", password:"SecurePass12" }) });
  assert.equal(registration.status, 201);
  assert.equal((await registration.json()).clientId, "AMY001");
  const login = await fetch(`${running.url}/api/auth/login`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ role:"client", identity:"ada@example.com", password:"SecurePass12" }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /amy_session=.*HttpOnly.*SameSite=Lax/i);
});

function requestJson(url, path, { method = "GET", cookie, body } = {}) {
  return fetch(`${url}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function sessionCookie(response) {
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function registerAndLogin(url, { fullName = "Ada Okafor", email = "ada@example.com", company = "Ada Logistics" } = {}) {
  const registration = await requestJson(url, "/api/auth/register", {
    method: "POST",
    body: { fullName, email, phone: "0801", state: "Lagos", lga: "Ikeja", company, password: "SecurePass12" },
  });
  assert.equal(registration.status, 201);
  const login = await requestJson(url, "/api/auth/login", {
    method: "POST", body: { role: "client", identity: email, password: "SecurePass12" },
  });
  assert.equal(login.status, 200);
  return { cookie: sessionCookie(login), user: (await login.json()).user };
}

async function changedAdmin(url) {
  const login = await requestJson(url, "/api/auth/login", {
    method: "POST", body: { role: "admin", identity: "admin_control", password: "Pa$$w0rd1177" },
  });
  assert.equal(login.status, 200);
  const cookie = sessionCookie(login);
  const changed = await requestJson(url, "/api/auth/change-password", {
    method: "POST", cookie, body: { currentPassword: "Pa$$w0rd1177", newPassword: "NewSecure123" },
  });
  assert.equal(changed.status, 200);
  return { cookie, user: (await login.json()).user };
}

async function createRequest(url, cookie, title = "Claims automation") {
  const response = await requestJson(url, "/api/requests", {
    method: "POST", cookie, body: { title, description: "Route claims automatically", priority: "high" },
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function invoiceFor(url, cookie, requestId) {
  const dashboard = await requestJson(url, "/api/dashboard", { cookie });
  assert.equal(dashboard.status, 200);
  return (await dashboard.json()).invoices.find((invoice) => invoice.service_request_id === requestId);
}

async function serverFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "amy-api-payments-"));
  const running = await startServer({ port: 0, databasePath: join(directory, "api.sqlite") });
  t.after(async () => { await running.close(); rmSync(directory, { recursive: true, force: true }); });
  return running;
}

test("HTTP API submits a Client payment and returns its owned invoice", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const request = await createRequest(running.url, client.cookie);
  const invoice = await invoiceFor(running.url, client.cookie, request.id);

  const payment = await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: client.cookie });
  assert.equal(payment.status, 200);
  const submitted = await payment.json();
  assert.equal(submitted.status, "payment_submitted");
  assert.match(submitted.payment_reference, /^PAY-/);
  assert.ok(submitted.payment_submitted_at);

  const fetched = await requestJson(running.url, `/api/invoices/${invoice.id}`, { cookie: client.cookie });
  assert.equal(fetched.status, 200);
  assert.equal((await fetched.json()).id, invoice.id);
});

test("HTTP API denies a Client payment attempt for another organization invoice", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const owner = await registerAndLogin(running.url);
  const other = await registerAndLogin(running.url, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const request = await createRequest(running.url, owner.cookie);
  const invoice = await invoiceFor(running.url, owner.cookie, request.id);

  const payment = await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: other.cookie });
  assert.equal(payment.status, 403);
  assert.equal((await payment.json()).error, "You are not authorized to perform this action");
});

test("HTTP API lets an Administrator confirm a submitted payment", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const admin = await changedAdmin(running.url);
  const request = await createRequest(running.url, client.cookie);
  const invoice = await invoiceFor(running.url, client.cookie, request.id);
  await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: client.cookie });

  const confirmation = await requestJson(running.url, `/api/invoices/${invoice.id}/confirm`, { method: "POST", cookie: admin.cookie });
  assert.equal(confirmation.status, 200);
  const paid = await confirmation.json();
  assert.equal(paid.status, "paid");
  assert.ok(paid.confirmed_at);
});

test("HTTP API lets an Administrator reject a submitted payment with a reason", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const admin = await changedAdmin(running.url);
  const request = await createRequest(running.url, client.cookie);
  const invoice = await invoiceFor(running.url, client.cookie, request.id);
  await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: client.cookie });

  const rejection = await requestJson(running.url, `/api/invoices/${invoice.id}/reject`, {
    method: "POST", cookie: admin.cookie, body: { reason: "Bank reference cannot be verified" },
  });
  assert.equal(rejection.status, 200);
  const rejected = await rejection.json();
  assert.equal(rejected.status, "unpaid");
  assert.equal(rejected.rejection_reason, "Bank reference cannot be verified");
});

test("HTTP API approves a request after its payment is confirmed", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const admin = await changedAdmin(running.url);
  const request = await createRequest(running.url, client.cookie);
  const invoice = await invoiceFor(running.url, client.cookie, request.id);
  await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: client.cookie });
  await requestJson(running.url, `/api/invoices/${invoice.id}/confirm`, { method: "POST", cookie: admin.cookie });

  const approval = await requestJson(running.url, `/api/requests/${request.id}/approve`, { method: "POST", cookie: admin.cookie });
  assert.equal(approval.status, 200);
  assert.equal((await approval.json()).status, "approved");
});

test("HTTP API rejects request approval before payment confirmation", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const admin = await changedAdmin(running.url);
  const request = await createRequest(running.url, client.cookie);

  const approval = await requestJson(running.url, `/api/requests/${request.id}/approve`, { method: "POST", cookie: admin.cookie });
  assert.equal(approval.status, 400);
  assert.equal((await approval.json()).error, "Invalid request");
});

test("HTTP API accepts identifiers and payment sessions only from validated cookies", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const admin = await changedAdmin(running.url);

  const invalidIdentifier = await requestJson(running.url, "/api/invoices/not-an-id/pay", { method: "POST", cookie: client.cookie });
  assert.equal(invalidIdentifier.status, 400);
  assert.equal((await invalidIdentifier.json()).error, "Invalid request");

  const missingReason = await requestJson(running.url, "/api/invoices/1/reject", { method: "POST", cookie: admin.cookie, body: { reason: "   " } });
  assert.equal(missingReason.status, 400);
  assert.equal((await missingReason.json()).error, "Invalid request");

  const queryToken = await requestJson(running.url, "/api/invoices/1?amy_session=not-a-cookie");
  assert.equal(queryToken.status, 401);
  assert.equal((await queryToken.json()).error, "Authentication required");
});

test("HTTP API returns a safe JSON error for malformed request bodies", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);

  const response = await fetch(`${running.url}/api/invoices/1/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const body = await response.text();

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /^application\/json/i);
  assert.deepEqual(JSON.parse(body), { error: "Invalid request" });
  assert.doesNotMatch(body, /SyntaxError|node_modules|portal\\/i);
});

test("HTTP API hides inconsistent invoice records from a Client whose request belongs to another organization", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const viewer = await registerAndLogin(running.url);
  const requestOwner = await registerAndLogin(running.url, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const request = await createRequest(running.url, requestOwner.cookie);
  const invoice = await invoiceFor(running.url, requestOwner.cookie, request.id);
  running.portal.db.prepare("UPDATE invoices SET organization_id=? WHERE id=?").run(viewer.user.organizationId, invoice.id);

  const directRead = await requestJson(running.url, `/api/invoices/${invoice.id}`, { cookie: viewer.cookie });
  assert.equal(directRead.status, 403);
  assert.equal((await directRead.json()).error, "You are not authorized to perform this action");

  const dashboard = await requestJson(running.url, "/api/dashboard", { cookie: viewer.cookie });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).invoices.some((row) => row.id === invoice.id), false);
});

test("Administrator dashboard includes inactive Staff governance records", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const admin = await changedAdmin(running.url);
  const client = await registerAndLogin(running.url);
  const staffCreation = await requestJson(running.url, "/api/staff", {
    method: "POST", cookie: admin.cookie,
    body: { fullName: "Inactive Staff", email: "inactive@amy.test", password: "StaffSecure1", specialty: "Automation Engineer" },
  });
  assert.equal(staffCreation.status, 201);
  const staff = await staffCreation.json();
  running.portal.db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(staff.id);

  const dashboard = await requestJson(running.url, "/api/dashboard", { cookie: admin.cookie });
  assert.equal(dashboard.status, 200);
  const staffRecord = (await dashboard.json()).staffMembers.find((row) => row.id === staff.id);
  assert.equal(staffRecord.fullName, "Inactive Staff");
  assert.equal(staffRecord.status, "inactive");

  const clientDashboard = await requestJson(running.url, "/api/dashboard", { cookie: client.cookie });
  assert.equal((await clientDashboard.json()).agentAvailability.some((row) => row.id === staff.id), false);
});

test("dashboard queries provide role-scoped commercial records with view fields", { concurrency: true }, async (t) => {
  const running = await serverFixture(t);
  const client = await registerAndLogin(running.url);
  const other = await registerAndLogin(running.url, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const admin = await changedAdmin(running.url);
  const staffCreation = await requestJson(running.url, "/api/staff", {
    method: "POST", cookie: admin.cookie,
    body: { fullName: "Ife Adebayo", email: "ife@amy.test", password: "StaffSecure1", specialty: "Automation Engineer" },
  });
  assert.equal(staffCreation.status, 201);
  const staff = await staffCreation.json();
  const staffLogin = await requestJson(running.url, "/api/auth/login", {
    method: "POST", body: { role: "staff", identity: "ife@amy.test", password: "StaffSecure1" },
  });
  const staffCookie = sessionCookie(staffLogin);
  const request = await createRequest(running.url, client.cookie, "Claims automation");
  await createRequest(running.url, other.cookie, "Other organization work");
  const invoice = await invoiceFor(running.url, client.cookie, request.id);
  await requestJson(running.url, "/api/tickets", { method: "POST", cookie: client.cookie, body: { subject: "Need help", detail: "Please call", priority: "medium" } });
  await requestJson(running.url, `/api/invoices/${invoice.id}/pay`, { method: "POST", cookie: client.cookie });
  await requestJson(running.url, `/api/invoices/${invoice.id}/confirm`, { method: "POST", cookie: admin.cookie });
  await requestJson(running.url, `/api/requests/${request.id}/approve`, { method: "POST", cookie: admin.cookie, body: { staffId: staff.id } });

  const adminDashboard = await requestJson(running.url, "/api/dashboard", { cookie: admin.cookie });
  assert.equal(adminDashboard.status, 200);
  const adminData = await adminDashboard.json();
  assert.equal(adminData.organizations.length, 2);
  assert.equal(adminData.staffMembers[0].fullName, "Ife Adebayo");
  assert.deepEqual(Object.keys(adminData.requests[0]).filter((key) => ["clientId", "company", "title", "status", "staffName", "staffEmail"].includes(key)).sort(), ["clientId", "company", "staffEmail", "staffName", "status", "title"]);
  const paidInvoice = adminData.invoices.find((row) => row.service_request_id === request.id);
  assert.equal(paidInvoice.invoiceNumber, "INV-000001");
  assert.equal(paidInvoice.paymentReference.startsWith("PAY-"), true);
  assert.ok(paidInvoice.paymentSubmittedAt);
  assert.ok(paidInvoice.confirmedAt);
  assert.equal(adminData.tickets[0].company, "Ada Logistics");
  assert.equal(adminData.auditEvents[0].action, "service_request.approved");
  assert.ok(adminData.auditEvents[0].actorName);
  assert.ok(adminData.auditEvents[0].occurredAt);

  const clientDashboard = await requestJson(running.url, "/api/dashboard", { cookie: client.cookie });
  const clientData = await clientDashboard.json();
  assert.equal(clientData.organizations.length, 1);
  assert.equal(clientData.organizations[0].company, "Ada Logistics");
  assert.equal(clientData.requests.length, 1);
  assert.equal(clientData.invoices.length, 1);
  assert.equal(clientData.tickets.length, 1);
  assert.equal(clientData.agentAvailability[0].fullName, "Ife Adebayo");
  assert.equal(clientData.auditEvents, undefined);

  const staffDashboard = await requestJson(running.url, "/api/dashboard", { cookie: staffCookie });
  const staffData = await staffDashboard.json();
  assert.equal(staffData.requests.length, 1);
  assert.equal(staffData.requests[0].title, "Claims automation");
  assert.equal(staffData.tickets.length, 0);
  assert.deepEqual(staffData.organizations, []);
  assert.deepEqual(staffData.invoices, []);
});
