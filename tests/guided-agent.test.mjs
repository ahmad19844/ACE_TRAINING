import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startServer } from "../server/index.mjs";
import { createPortal } from "../server/portal.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "amy-guided-agent-"));
  const portal = createPortal({ databasePath: join(directory, "test.sqlite") });
  return { portal, close: () => { portal.close(); rmSync(directory, { recursive: true, force: true }); } };
}

async function createClient(portal, { fullName = "Ada Okafor", email = "ada@example.com", company = "Ada Logistics" } = {}) {
  await portal.registerClient({ fullName, email, phone: "0801", state: "Lagos", lga: "Ikeja", company, password: "SecurePass12" });
  return portal.login({ role: "client", identity: email, password: "SecurePass12" });
}

async function changedAdmin(portal) {
  const admin = await portal.login({ role: "admin", identity: "admin_control", password: "Pa$$w0rd1177" });
  portal.changePassword(admin.token, "NewSecure123", "Pa$$w0rd1177");
  return admin;
}

function approveRequest(portal, clientToken, adminToken, requestId, staffId = null) {
  const invoice = portal.listInvoices(clientToken).find((item) => item.service_request_id === requestId);
  portal.submitPayment(clientToken, invoice.id);
  portal.confirmPayment(adminToken, invoice.id);
  return portal.approvePaidRequest(adminToken, requestId, staffId);
}

test("guided agent stays locked until the request has been approved", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Invoice extraction", description: "Extract supplier invoice details", priority: "high" });

  assert.throws(() => ctx.portal.getAgentPlan(client.token, request.id), /approved/i);
  assert.throws(() => ctx.portal.updateAgentStep(client.token, request.id, "discovery", true), /approved/i);
});

test("guided agent derives stable, specialized plans and practical context checks from each approved request", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const otherClient = await createClient(ctx.portal, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const admin = await changedAdmin(ctx.portal);
  const invoiceRequest = ctx.portal.createServiceRequest(client.token, {
    title: "Supplier invoice capture",
    description: "Finance owner Ada processes 500 confidential supplier invoice PDFs weekly in ERP. Sample invoices are attached. Success means 98% field accuracy.",
    priority: "high",
  });
  const supportRequest = ctx.portal.createServiceRequest(otherClient.token, {
    title: "Customer support triage",
    description: "Route customer support messages to the right queue.",
    priority: "low",
  });
  approveRequest(ctx.portal, client.token, admin.token, invoiceRequest.id);
  approveRequest(ctx.portal, otherClient.token, admin.token, supportRequest.id);

  const first = ctx.portal.getAgentPlan(client.token, invoiceRequest.id);
  const second = ctx.portal.getAgentPlan(client.token, invoiceRequest.id);
  const contrast = ctx.portal.getAgentPlan(otherClient.token, supportRequest.id);

  assert.equal(first.request.title, "Supplier invoice capture");
  assert.equal(first.request.priority, "high");
  assert.equal(first.organization.company, "Ada Logistics");
  assert.equal(first.category, "invoice/document");
  assert.equal(contrast.category, "customer support");
  assert.deepEqual(second.steps.map((step) => step.key), first.steps.map((step) => step.key));
  assert.notDeepEqual(contrast.steps.map((step) => step.key), first.steps.map((step) => step.key));
  assert.match(first.steps.find((step) => step.phase === "required-data-input").description, /supplier invoice/i);
  assert.match(contrast.steps.find((step) => step.phase === "required-data-input").description, /customer message|support ticket/i);
  assert.ok(first.requiredInformation.every((item) => item.supplied));
  assert.ok(contrast.requiredInformation.every((item) => !item.supplied));
  assert.match(contrast.nextAction.action, /Process owner.*Sample inputs.*Systems or integrations/i);
  assert.equal(first.completionPercentage, 0);
  assert.equal(first.nextStep.phase, "discovery");
  assert.equal(first.nextAction.role, "client");
});

test("guided agent prevents a Client from reading another organization's approved plan", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const owner = await createClient(ctx.portal);
  const other = await createClient(ctx.portal, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(owner.token, { title: "Support inbox", description: "Route customer support messages", priority: "medium" });

  assert.throws(() => ctx.portal.getAgentPlan(other.token, request.id), /authorized/i);
  approveRequest(ctx.portal, owner.token, admin.token, request.id);

  assert.throws(() => ctx.portal.getAgentPlan(other.token, request.id), /authorized/i);
  assert.throws(() => ctx.portal.updateAgentStep(other.token, request.id, "discovery", true), /authorized/i);
});

test("guided agent denies unassigned Staff but permits assigned Staff and Administrator oversight", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const staff = ctx.portal.createStaff(admin.token, { fullName: "Ife Adebayo", email: "ife@amy.test", password: "StaffSecure1", specialty: "Automation Engineer" });
  const staffLogin = await ctx.portal.login({ role: "staff", identity: "ife@amy.test", password: "StaffSecure1" });
  const request = ctx.portal.createServiceRequest(client.token, { title: "Customer emails", description: "Send delivery notifications", priority: "medium" });
  approveRequest(ctx.portal, client.token, admin.token, request.id);
  const stepKey = ctx.portal.getAgentPlan(client.token, request.id).steps[0].key;

  assert.throws(() => ctx.portal.getAgentPlan(staffLogin.token, request.id), /assigned/i);
  assert.throws(() => ctx.portal.updateAgentStep(staffLogin.token, request.id, stepKey, true), /assigned/i);
  ctx.portal.db.prepare("UPDATE service_requests SET assigned_staff_id=? WHERE id=?").run(staff.id, request.id);

  assert.equal(ctx.portal.updateAgentStep(staffLogin.token, request.id, stepKey, true).nextAction.role, "staff");
  assert.equal(ctx.portal.getAgentPlan(admin.token, request.id).nextAction.role, "admin");
});

test("guided agent persists valid checklist progress and audits it without changing protected workflow state", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const staff = ctx.portal.createStaff(admin.token, { fullName: "Ife Adebayo", email: "ife@amy.test", password: "StaffSecure1", specialty: "Automation Engineer" });
  const staffLogin = await ctx.portal.login({ role: "staff", identity: "ife@amy.test", password: "StaffSecure1" });
  const request = ctx.portal.createServiceRequest(client.token, { title: "Invoice extraction", description: "Extract supplier invoice details", priority: "high" });
  approveRequest(ctx.portal, client.token, admin.token, request.id, staff.id);
  const stepKey = ctx.portal.getAgentPlan(client.token, request.id).steps[0].key;
  const beforeRequest = { ...ctx.portal.db.prepare("SELECT * FROM service_requests WHERE id=?").get(request.id) };
  const beforeInvoice = { ...ctx.portal.db.prepare("SELECT * FROM invoices WHERE service_request_id=?").get(request.id) };

  const updated = ctx.portal.updateAgentStep(staffLogin.token, request.id, stepKey, true);
  const afterRequest = { ...ctx.portal.db.prepare("SELECT * FROM service_requests WHERE id=?").get(request.id) };
  const afterInvoice = { ...ctx.portal.db.prepare("SELECT * FROM invoices WHERE service_request_id=?").get(request.id) };
  const reloaded = ctx.portal.getAgentPlan(client.token, request.id);
  const audit = ctx.portal.db.prepare("SELECT action, actor_id, entity_type, entity_id FROM audit_events WHERE action='agent.step_progress_updated' ORDER BY id DESC LIMIT 1").get();

  assert.equal(updated.completionPercentage, 20);
  assert.equal(updated.steps.find((step) => step.key === stepKey).completed, true);
  assert.deepEqual(afterRequest, beforeRequest);
  assert.deepEqual(afterInvoice, beforeInvoice);
  assert.equal(reloaded.steps.find((step) => step.key === stepKey).completed, true);
  assert.equal(audit.action, "agent.step_progress_updated");
  assert.equal(audit.actor_id, staffLogin.user.id);
  assert.equal(audit.entity_type, "service_request");
  assert.equal(audit.entity_id, String(request.id));
});

test("guided agent rejects unknown checklist keys without saving progress", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Invoice extraction", description: "Extract supplier invoice details", priority: "high" });
  approveRequest(ctx.portal, client.token, admin.token, request.id);
  const knownStepKey = ctx.portal.getAgentPlan(client.token, request.id).steps[0].key;

  assert.throws(() => ctx.portal.updateAgentStep(client.token, request.id, "approval-status", true), /step/i);
  assert.throws(() => ctx.portal.updateAgentStep(client.token, request.id, knownStepKey, "true"), /true or false/i);
  assert.equal(ctx.portal.getAgentPlan(client.token, request.id).completionPercentage, 0);
  assert.equal(ctx.portal.db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='agent.step_progress_updated' AND entity_id=?").get(String(request.id)).count, 0);
});

test("guided-agent routes require a session and return persisted plan progress", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "amy-guided-agent-api-"));
  const running = await startServer({ port: 0, databasePath: join(directory, "test.sqlite") });
  t.after(async () => { await running.close(); rmSync(directory, { recursive: true, force: true }); });
  const client = await createClient(running.portal);
  const admin = await changedAdmin(running.portal);
  const request = running.portal.createServiceRequest(client.token, { title: "Invoice extraction", description: "Extract supplier invoice details", priority: "high" });
  approveRequest(running.portal, client.token, admin.token, request.id);
  const headers = { cookie: `amy_session=${client.token}` };

  const missingSession = await fetch(`${running.url}/api/requests/${request.id}/agent`);
  const plan = await fetch(`${running.url}/api/requests/${request.id}/agent`, { headers });
  const planBody = await plan.json();
  const stepKey = planBody.steps[0].key;
  const malformedProgress = await fetch(`${running.url}/api/requests/${request.id}/agent/${stepKey}`, {
    method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ completed: "yes" }),
  });
  const unchangedPlan = await fetch(`${running.url}/api/requests/${request.id}/agent`, { headers });
  const progress = await fetch(`${running.url}/api/requests/${request.id}/agent/${stepKey}`, {
    method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ completed: true }),
  });

  assert.equal(missingSession.status, 401);
  assert.equal(plan.status, 200);
  assert.equal(planBody.request.id, request.id);
  assert.equal(malformedProgress.status, 400);
  assert.equal((await unchangedPlan.json()).steps.find((step) => step.key === stepKey).completed, false);
  assert.equal(progress.status, 200);
  assert.equal((await progress.json()).steps.find((step) => step.key === stepKey).completed, true);
});
