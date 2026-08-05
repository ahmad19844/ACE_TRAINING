# AMY AI Business Automation Portal

A commercial role-based portal for AI-powered business automation services. It provides server-owned authentication, permanent Client IDs, Administrator/Client/Staff dashboards, tenant isolation, staff assignments, workflow handoffs, support records, billing views, and append-only audit events.

## Run locally

1. Install Node.js 22 or later.
2. Run `npm install`.
3. Run `npm run build`.
4. Run `npm run server`.
5. Open `http://127.0.0.1:4173`.

The server creates `data/portal.sqlite` automatically. Override its location with `DATABASE_PATH`.

## Initial administrator

- Username: `admin_control`
- Password: `Pa$$w0rd1177`

The first successful administrator login is restricted to the password replacement screen. The replacement must be exactly 12 characters and contain uppercase, lowercase, and numeric characters.

## Security notes

- Passwords are hashed with Node.js scrypt and unique salts.
- Sessions use opaque random tokens; only SHA-256 token digests are stored.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- API authorization checks role, organization ownership, and Staff assignment.
- Sensitive authentication, authorization, registration, assignment, and workflow actions write audit events.
- Security headers disable framing and browser capabilities that the portal does not need.

SQLite makes the application immediately runnable on one controlled server. For horizontally scaled production hosting, replace `server/database.mjs` with a PostgreSQL adapter while retaining the service/authorization boundaries in `server/portal.mjs`. Terminate TLS at a trusted reverse proxy and set `NODE_ENV=production`.

## Commercial lifecycle

The exact commercial lifecycle is: request → invoice → Client simulated payment → Admin payment confirmation → Admin approval → guided agent.

Simulated payment exists only for workflow validation. It must be replaced by an approved payment provider before accepting real money.

## Verification

- `npm test` runs domain, API, security, workflow, content, and Sites packaging tests.
- `npm run build` creates the production web bundle and hosting artifacts.
