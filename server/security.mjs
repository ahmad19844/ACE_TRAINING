import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function validatePassword(password) {
  const checks = {
    exactLength: typeof password === "string" && password.length === 12,
    uppercase: /[A-Z]/.test(password ?? ""),
    lowercase: /[a-z]/.test(password ?? ""),
    number: /\d/.test(password ?? ""),
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, saltHex, hashHex] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

