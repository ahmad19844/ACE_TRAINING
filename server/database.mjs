import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      state TEXT NOT NULL,
      lga TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER REFERENCES organizations(id),
      role TEXT NOT NULL CHECK(role IN ('admin','client','staff')),
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      outcome TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS staff_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      specialty TEXT NOT NULL,
      availability TEXT NOT NULL DEFAULT 'available'
    );
    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      assigned_staff_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'awaiting_payment',
      last_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      assigned_staff_id INTEGER REFERENCES users(id),
      subject TEXT NOT NULL,
      detail TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      service_request_id INTEGER NOT NULL UNIQUE REFERENCES service_requests(id),
      invoice_number TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      payment_reference TEXT,
      payment_submitted_at TEXT,
      rejection_reason TEXT,
      confirmed_at TEXT,
      confirmed_by INTEGER REFERENCES users(id),
      due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agent_step_progress (
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      service_request_id INTEGER NOT NULL REFERENCES service_requests(id),
      step_key TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      completed_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (organization_id, service_request_id, step_key)
    );
    CREATE TABLE IF NOT EXISTS client_sequence (singleton INTEGER PRIMARY KEY CHECK(singleton=1), next_value INTEGER NOT NULL);
    INSERT OR IGNORE INTO client_sequence(singleton, next_value) VALUES(1, 1);
  `);
  const ensureColumn = (table, name, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    if (!columns.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  ensureColumn("invoices", "service_request_id", "INTEGER REFERENCES service_requests(id)");
  ensureColumn("invoices", "payment_reference", "TEXT");
  ensureColumn("invoices", "payment_submitted_at", "TEXT");
  ensureColumn("invoices", "rejection_reason", "TEXT");
  ensureColumn("invoices", "confirmed_at", "TEXT");
  ensureColumn("invoices", "confirmed_by", "INTEGER REFERENCES users(id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS invoices_service_request_id_unique ON invoices(service_request_id) WHERE service_request_id IS NOT NULL");
  return db;
}
