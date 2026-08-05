import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPortal } from "./portal.mjs";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const cookieToken = (request) => (request.headers.cookie ?? "").split(";").map((item) => item.trim()).find((item) => item.startsWith("amy_session="))?.slice(12) ?? "";
const numericId = (value) => {
  if (!/^[1-9]\d*$/.test(String(value ?? ""))) throw new Error("Invalid identifier");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new Error("Invalid identifier");
  return id;
};

const safeError = (error) => {
  const message = String(error?.message ?? "");
  if (/^Authentication required$|^Invalid credentials$/i.test(message)) return { status: 401, error: "Authentication required" };
  if (/authorized|assigned|permitted/i.test(message)) return { status: 403, error: "You are not authorized to perform this action" };
  return { status: 400, error: "Invalid request" };
};

function handler(action, successStatus = 200) {
  return async (request, response) => {
    try {
      const result = await action(request);
      response.status(successStatus).json(result ?? { success: true });
    } catch (error) {
      const { status, error: message } = safeError(error);
      response.status(status).json({ error: message });
    }
  };
}

export async function startServer({ port = Number(process.env.PORT ?? 4173), databasePath = process.env.DATABASE_PATH ?? join(moduleDirectory, "../data/portal.sqlite") } = {}) {
  const portal = createPortal({ databasePath });
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((_, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.post("/api/auth/register", handler((request) => portal.registerClient(request.body), 201));
  app.post("/api/auth/login", handler(async (request) => {
    const result = await portal.login(request.body);
    request.res.cookie("amy_session", result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 28800000, path: "/" });
    return { user: result.user, next: result.next };
  }));
  app.get("/api/session", handler((request) => portal.requireSession(cookieToken(request))));
  app.post("/api/auth/change-password", handler((request) => portal.changePassword(cookieToken(request), request.body.newPassword, request.body.currentPassword)));
  app.get("/api/dashboard", handler((request) => portal.getDashboard(cookieToken(request))));
  app.post("/api/staff", handler((request) => portal.createStaff(cookieToken(request), request.body), 201));
  app.post("/api/requests", handler((request) => portal.createServiceRequest(cookieToken(request), request.body), 201));
  app.patch("/api/requests/:id", handler((request) => portal.transitionRequest(cookieToken(request), Number(request.params.id), request.body.status, request.body)));
  app.get("/api/requests/:id/agent", handler((request) => portal.getAgentPlan(cookieToken(request), numericId(request.params.id))));
  app.patch("/api/requests/:id/agent/:stepKey", handler((request) => portal.updateAgentStep(cookieToken(request), numericId(request.params.id), request.params.stepKey, request.body?.completed)));
  app.get("/api/invoices/:id", handler((request) => portal.getInvoice(cookieToken(request), numericId(request.params.id))));
  app.post("/api/invoices/:id/pay", handler((request) => portal.submitPayment(cookieToken(request), numericId(request.params.id))));
  app.post("/api/invoices/:id/confirm", handler((request) => portal.confirmPayment(cookieToken(request), numericId(request.params.id))));
  app.post("/api/invoices/:id/reject", handler((request) => {
    const reason = String(request.body?.reason ?? "").trim();
    if (!reason) throw new Error("A rejection reason is required");
    return portal.rejectPayment(cookieToken(request), numericId(request.params.id), reason);
  }));
  app.post("/api/requests/:id/approve", handler((request) => {
    const staffId = request.body?.staffId == null ? null : numericId(request.body.staffId);
    return portal.approvePaidRequest(cookieToken(request), numericId(request.params.id), staffId);
  }));
  app.post("/api/tickets", handler((request) => portal.createTicket(cookieToken(request), request.body), 201));
  app.post("/api/auth/logout", (_, response) => { response.clearCookie("amy_session", { path: "/" }); response.json({ success: true }); });
  const staticDirectory = join(moduleDirectory, "../dist/client");
  if (existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory));
    app.get("/{*path}", (_, response) => response.sendFile(join(staticDirectory, "index.html")));
  }
  app.use((error, _request, response, next) => {
    if (response.headersSent) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    response.status(status).json({ error: status === 500 ? "Unable to complete this request" : "Invalid request" });
  });
  const server = await new Promise((resolve) => { const listening = app.listen(port, "127.0.0.1", () => resolve(listening)); });
  const address = server.address();
  return { app, portal, url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => { portal.close(); error ? reject(error) : resolve(); })) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const running = await startServer();
  console.log(`AMY Portal running at ${running.url}`);
}
