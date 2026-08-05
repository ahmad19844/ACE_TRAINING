import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPortal } from "../server/portal.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "amy-payment-"));
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

test("creating a request atomically generates one unpaid ₦2,000 invoice", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);

  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims", priority: "high" });
  const invoices = ctx.portal.listInvoices(client.token);
  const events = ctx.portal.db.prepare("SELECT action FROM audit_events ORDER BY id").all().map((row) => row.action);

  assert.equal(request.status, "awaiting_payment");
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].service_request_id, request.id);
  assert.equal(invoices[0].amount, 2000);
  assert.equal(invoices[0].status, "unpaid");
  assert.ok(events.includes("invoice.generated"));
});

test("a client can submit payment only for its unpaid invoice once", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];

  const submitted = ctx.portal.submitPayment(client.token, invoice.id);

  assert.equal(submitted.status, "payment_submitted");
  assert.match(submitted.payment_reference, /^PAY-/);
  assert.ok(submitted.payment_submitted_at);
  assert.equal(ctx.portal.listRequests(client.token).find((row) => row.id === request.id).status, "payment_pending_confirmation");
  assert.throws(() => ctx.portal.submitPayment(client.token, invoice.id), /already|unpaid|state|not awaiting/i);
});

test("a client cannot submit payment for another organization's invoice", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const owner = await createClient(ctx.portal);
  const other = await createClient(ctx.portal, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  ctx.portal.createServiceRequest(owner.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(owner.token)[0];

  assert.throws(() => ctx.portal.submitPayment(other.token, invoice.id), /authorized/i);
});

test("payment submission rejects an invoice whose linked request belongs to another tenant", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const invoiceOwner = await createClient(ctx.portal);
  const requestOwner = await createClient(ctx.portal, { fullName: "Tunde Bello", email: "tunde@example.com", company: "Bello Foods" });
  const request = ctx.portal.createServiceRequest(requestOwner.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(requestOwner.token)[0];
  const invoiceOwnerId = ctx.portal.requireSession(invoiceOwner.token, "client").user.organizationId;
  ctx.portal.db.prepare("UPDATE invoices SET organization_id=? WHERE id=?").run(invoiceOwnerId, invoice.id);

  assert.throws(() => ctx.portal.submitPayment(invoiceOwner.token, invoice.id), /authorized/i);
  assert.equal(ctx.portal.db.prepare("SELECT status FROM service_requests WHERE id=?").get(request.id).status, "awaiting_payment");
  assert.equal(ctx.portal.db.prepare("SELECT status FROM invoices WHERE id=?").get(invoice.id).status, "unpaid");
});

test("an administrator can reject a submitted payment and return the request to payment", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];
  ctx.portal.submitPayment(client.token, invoice.id);

  const rejected = ctx.portal.rejectPayment(admin.token, invoice.id, "Bank transfer reference is invalid");

  assert.equal(rejected.status, "unpaid");
  assert.equal(rejected.rejection_reason, "Bank transfer reference is invalid");
  assert.equal(ctx.portal.listRequests(client.token).find((row) => row.id === request.id).status, "awaiting_payment");
  assert.throws(() => ctx.portal.rejectPayment(admin.token, invoice.id, "Again"), /already|submitted|state|not awaiting/i);
  const resubmitted = ctx.portal.submitPayment(client.token, invoice.id);
  assert.equal(resubmitted.status, "payment_submitted");
});

test("an administrator cannot reject a payment after it has been confirmed", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];
  ctx.portal.submitPayment(client.token, invoice.id);
  ctx.portal.confirmPayment(admin.token, invoice.id);

  assert.throws(() => ctx.portal.rejectPayment(admin.token, invoice.id, "Too late"), /not awaiting|submitted|state/i);
  assert.equal(ctx.portal.db.prepare("SELECT status FROM invoices WHERE id=?").get(invoice.id).status, "paid");
  assert.equal(ctx.portal.db.prepare("SELECT status FROM service_requests WHERE id=?").get(request.id).status, "pending_admin_approval");
  assert.equal(ctx.portal.db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='payment.rejected' AND entity_type='invoice' AND entity_id=?").get(String(invoice.id)).count, 0);
});

test("an administrator cannot confirm a payment after it has been rejected", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];
  ctx.portal.submitPayment(client.token, invoice.id);
  ctx.portal.rejectPayment(admin.token, invoice.id, "Reference cannot be verified");

  assert.throws(() => ctx.portal.confirmPayment(admin.token, invoice.id), /not awaiting|submitted|state/i);
  assert.equal(ctx.portal.db.prepare("SELECT status FROM invoices WHERE id=?").get(invoice.id).status, "unpaid");
  assert.equal(ctx.portal.db.prepare("SELECT status FROM service_requests WHERE id=?").get(request.id).status, "awaiting_payment");
  assert.equal(ctx.portal.db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action='payment.confirmed' AND entity_type='invoice' AND entity_id=?").get(String(invoice.id)).count, 0);
});

test("confirmation records the administrator and enables paid-request approval", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];

  assert.throws(() => ctx.portal.approvePaidRequest(admin.token, request.id), /paid|pending/i);
  ctx.portal.submitPayment(client.token, invoice.id);
  const paid = ctx.portal.confirmPayment(admin.token, invoice.id);
  const approved = ctx.portal.approvePaidRequest(admin.token, request.id);

  assert.equal(paid.status, "paid");
  assert.equal(paid.confirmed_by, admin.user.id);
  assert.ok(paid.confirmed_at);
  assert.equal(approved.status, "approved");
  assert.throws(() => ctx.portal.confirmPayment(admin.token, invoice.id), /already|submitted|state|not awaiting/i);
  assert.throws(() => ctx.portal.approvePaidRequest(admin.token, request.id), /already|pending|state/i);
  const events = ctx.portal.db.prepare("SELECT action FROM audit_events WHERE entity_id=? ORDER BY id").all(String(request.id)).map((row) => row.action);
  assert.ok(events.includes("payment.submitted"));
  assert.ok(events.includes("payment.confirmed"));
  assert.ok(events.includes("service_request.approved"));
});

test("payment controls reject client and staff roles, blank reasons, and invalid Staff assignment", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const staff = ctx.portal.createStaff(admin.token, { fullName: "Ife Adebayo", email: "ife@amy.test", password: "StaffSecure1", specialty: "Automation Engineer" });
  const staffLogin = await ctx.portal.login({ role: "staff", identity: "ife@amy.test", password: "StaffSecure1" });
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];
  ctx.portal.submitPayment(client.token, invoice.id);

  assert.throws(() => ctx.portal.rejectPayment(client.token, invoice.id, "No"), /authorized/i);
  assert.throws(() => ctx.portal.confirmPayment(client.token, invoice.id), /authorized/i);
  assert.throws(() => ctx.portal.approvePaidRequest(client.token, request.id), /authorized/i);
  assert.throws(() => ctx.portal.rejectPayment(staffLogin.token, invoice.id, "No"), /authorized/i);
  assert.throws(() => ctx.portal.confirmPayment(staffLogin.token, invoice.id), /authorized/i);
  assert.throws(() => ctx.portal.approvePaidRequest(staffLogin.token, request.id), /authorized/i);
  assert.throws(() => ctx.portal.rejectPayment(admin.token, invoice.id, "   "), /reason/i);
  ctx.portal.confirmPayment(admin.token, invoice.id);
  assert.throws(() => ctx.portal.approvePaidRequest(admin.token, request.id, client.user.id), /Staff/i);
  ctx.portal.db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(staff.id);
  assert.throws(() => ctx.portal.approvePaidRequest(admin.token, request.id, staff.id), /Staff/i);
});

test("payment and approval audits use their actual entity type and ID", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const client = await createClient(ctx.portal);
  const admin = await changedAdmin(ctx.portal);
  const request = ctx.portal.createServiceRequest(client.token, { title: "Claims automation", description: "Route claims" });
  const invoice = ctx.portal.listInvoices(client.token)[0];
  const firstSubmission = ctx.portal.submitPayment(client.token, invoice.id);
  ctx.portal.rejectPayment(admin.token, invoice.id, "Reference cannot be verified");
  ctx.portal.submitPayment(client.token, invoice.id);
  ctx.portal.confirmPayment(admin.token, invoice.id);
  ctx.portal.approvePaidRequest(admin.token, request.id);
  const invoiceEvents = ctx.portal.db.prepare(`SELECT action, actor_id, outcome, detail FROM audit_events
    WHERE entity_type='invoice' AND entity_id=? ORDER BY id`).all(String(invoice.id));
  const requestEvents = ctx.portal.db.prepare(`SELECT action, actor_id, outcome, detail FROM audit_events
    WHERE entity_type='service_request' AND entity_id=? ORDER BY id`).all(String(request.id));

  assert.deepEqual(invoiceEvents.map((event) => event.action), ["invoice.generated", "payment.submitted", "payment.rejected", "payment.submitted", "payment.confirmed"]);
  assert.deepEqual(requestEvents.map((event) => event.action), ["service_request.submitted", "service_request.approved"]);
  assert.equal(invoiceEvents[1].actor_id, client.user.id);
  assert.equal(invoiceEvents[1].outcome, "success");
  assert.equal(invoiceEvents[1].detail, firstSubmission.payment_reference);
  assert.equal(invoiceEvents[2].actor_id, admin.user.id);
  assert.equal(invoiceEvents[2].detail, "Reference cannot be verified");
  assert.equal(requestEvents[1].actor_id, admin.user.id);
});
