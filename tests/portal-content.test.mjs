import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

function componentBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("login portal exposes the product identity and every access path", () => {
  assert.match(source, /AI-Powered Business Automation Services/);
  assert.match(source, /Administrator Login/);
  assert.match(source, /Client Login/);
  assert.match(source, /Staff Login/);
  assert.match(source, /Client Sign Up/);
});

test("commercial portal includes role dashboards and core workflow actions", () => {
  assert.match(source, /Business command centre/);
  assert.match(source, /New Service Request/);
  assert.match(source, /Customer Organizations/);
  assert.match(source, /Assigned Work/);
  assert.match(source, /Support Cases/);
  assert.match(source, /Invoices & Payments/);
  assert.match(source, /Change Default Password/);
});

test("client invoices provide a print-ready commercial record before simulated payment", () => {
  const invoice = componentBody("InvoiceDetail", "GuidedAgentView");
  assert.match(invoice, /AI-Powered Business Automation Services/);
  assert.match(invoice, /AMY Automation/);
  assert.match(invoice, /Invoice number/);
  assert.match(invoice, /Linked request/);
  assert.match(invoice, /Client ID/);
  assert.match(invoice, /Organization/);
  assert.match(invoice, /Issue date/);
  assert.match(invoice, /Payment status/);
  assert.match(invoice, /Print \/ Save Invoice/);
  assert.match(invoice, /window\.print\(\)/);
  assert.match(invoice, /<tbody>[\s\S]*Service assessment[\s\S]*formatNairaDecimal\(invoice\.amount\)[\s\S]*<\/tbody>/);
  assert.match(invoice, /<tfoot>[\s\S]*Total[\s\S]*formatNairaDecimal\(invoice\.amount\)[\s\S]*<\/tfoot>/);
  assert.match(styles, /@media print/);
  assert.match(styles, /\.invoice-print-area/);
  assert.match(styles, /\.sidebar/);
});

test("Administrator invoice actions show a loading label only for the requested action", () => {
  const adminInvoices = componentBody("AdminInvoicesView", "AuditView");
  assert.match(adminInvoices, /const \[busyAction, setBusyAction\] = useState\(null\)/);
  assert.match(adminInvoices, /busyAction\?\.id === invoice\.id && busyAction\?\.action === "confirm"/);
  assert.match(adminInvoices, /busyAction\?\.id === invoice\.id && busyAction\?\.action === "reject"/);
});

test("commercial actions require confirmation and the README records the validation-only lifecycle", () => {
  assert.match(source, /window\.confirm/);
  assert.match(source, /Simulate payment/);
  assert.match(source, /Confirm payment/);
  assert.match(source, /Approve request/);
  assert.match(readme, /request → invoice → Client simulated payment → Admin payment confirmation → Admin approval → guided agent/);
  assert.match(readme, /must be replaced by an approved payment provider before accepting real money/);
});
