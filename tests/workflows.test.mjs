import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPortal } from "../server/portal.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "amy-workflow-"));
  const portal = createPortal({ databasePath: join(directory, "test.sqlite") });
  return { portal, close: () => { portal.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test("administrator must replace the default password before dashboard access", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  const login = await ctx.portal.login({ role: "admin", identity: "admin_control", password: "Pa$$w0rd1177" });
  assert.throws(() => ctx.portal.getDashboard(login.token), /change.*password/i);
  ctx.portal.changePassword(login.token, "NewSecure123", "Pa$$w0rd1177");
  assert.equal(ctx.portal.getDashboard(login.token).role, "admin");
});

test("service request is payment-gated before administrator approval", async (t) => {
  const ctx = fixture(); t.after(ctx.close);
  await ctx.portal.registerClient({ fullName:"Ada Okafor", email:"ada@example.com", phone:"0801", state:"Lagos", lga:"Ikeja", company:"Ada Logistics", password:"SecurePass12" });
  const client = await ctx.portal.login({ role:"client", identity:"ada@example.com", password:"SecurePass12" });
  const admin = await ctx.portal.login({ role:"admin", identity:"admin_control", password:"Pa$$w0rd1177" });
  ctx.portal.changePassword(admin.token, "NewSecure123", "Pa$$w0rd1177");
  const staff = ctx.portal.createStaff(admin.token, { fullName:"Ife Adebayo", email:"ife@amy.test", password:"StaffSecure1", specialty:"Automation Engineer" });
  const request = ctx.portal.createServiceRequest(client.token, { title:"Invoice processing automation", description:"Automate invoice capture and approvals", priority:"high" });
  assert.equal(request.status, "awaiting_payment");
  const invoice = ctx.portal.listInvoices(client.token).find((row) => row.service_request_id === request.id);
  ctx.portal.submitPayment(client.token, invoice.id);
  ctx.portal.confirmPayment(admin.token, invoice.id);
  const approved = ctx.portal.approvePaidRequest(admin.token, request.id, staff.id);
  assert.equal(approved.status, "approved");
  assert.equal(approved.assigned_staff_id, staff.id);
});
