import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createPortal } from "../server/portal.mjs";
import { validatePassword } from "../server/security.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "amy-portal-"));
  const portal = createPortal({ databasePath: join(directory, "test.sqlite") });
  return {
    portal,
    close() {
      portal.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("password policy requires exactly 12 characters with upper, lower, and numeric characters", () => {
  assert.equal(validatePassword("Pa$$w0rd1177").valid, true);
  assert.equal(validatePassword("Pa$$w0rd117").valid, false);
  assert.equal(validatePassword("Pa$$w0rd11777").valid, false);
  assert.equal(validatePassword("pa$$w0rd1177").valid, false);
  assert.equal(validatePassword("PA$$W0RD1177").valid, false);
  assert.equal(validatePassword("PasswordOnly").valid, false);
});

test("default administrator is seeded and must replace the initial password", async (t) => {
  const ctx = fixture();
  t.after(() => ctx.close());

  const login = await ctx.portal.login({ role: "admin", identity: "admin_control", password: "Pa$$w0rd1177" });
  assert.equal(login.user.role, "admin");
  assert.equal(login.user.mustChangePassword, true);
  assert.equal(login.next, "change-password");
});

test("client registration persists required details and allocates permanent IDs in order", async (t) => {
  const ctx = fixture();
  t.after(() => ctx.close());
  const first = await ctx.portal.registerClient({
    fullName: "Ada Okafor", email: "ada@example.com", phone: "+2348012345678",
    state: "Lagos", lga: "Ikeja", company: "Ada Logistics", password: "SecurePass12",
  });
  const second = await ctx.portal.registerClient({
    fullName: "Tunde Bello", email: "tunde@example.com", phone: "+2348098765432",
    state: "Oyo", lga: "Ibadan North", company: "Bello Foods", password: "AnotherPass1",
  });
  assert.equal(first.clientId, "AMY001");
  assert.equal(second.clientId, "AMY002");
  assert.equal(ctx.portal.getClientById("AMY001").company, "Ada Logistics");
});

test("sessions enforce roles and client organization isolation", async (t) => {
  const ctx = fixture();
  t.after(() => ctx.close());
  await ctx.portal.registerClient({
    fullName: "Ada Okafor", email: "ada@example.com", phone: "+2348012345678",
    state: "Lagos", lga: "Ikeja", company: "Ada Logistics", password: "SecurePass12",
  });
  await ctx.portal.registerClient({
    fullName: "Tunde Bello", email: "tunde@example.com", phone: "+2348098765432",
    state: "Oyo", lga: "Ibadan North", company: "Bello Foods", password: "AnotherPass1",
  });
  const login = await ctx.portal.login({ role: "client", identity: "ada@example.com", password: "SecurePass12" });
  assert.equal(ctx.portal.requireSession(login.token, "client").user.email, "ada@example.com");
  assert.throws(() => ctx.portal.requireSession(login.token, "admin"), /not authorized/i);
  assert.throws(() => ctx.portal.getOrganizationForSession(login.token, "AMY002"), /not authorized/i);
});

