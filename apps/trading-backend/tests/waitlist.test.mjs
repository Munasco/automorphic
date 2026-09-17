import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWaitlistEmail, allowedWaitlistOrigin } from "../convex/waitlistValidation.ts";

test("normalizes duplicate email variants while preserving plus addresses", () => {
  assert.equal(normalizeWaitlistEmail("  Trader+MGC@Example.COM "), "trader+mgc@example.com");
});
test("rejects malformed, missing, and oversized email inputs", () => {
  for (const value of [
    null,
    {},
    1,
    "",
    "name",
    "a@@example.com",
    "a b@example.com",
    "a@example",
    `${"a".repeat(250)}@example.com`,
  ]) {
    assert.equal(normalizeWaitlistEmail(value), null);
  }
});
test("CORS only permits exact configured origins", () => {
  const allowed = "https://automorphic-six.vercel.app, http://localhost:4173";
  assert.equal(allowedWaitlistOrigin("http://localhost:4173", allowed), "http://localhost:4173");
  for (const value of [
    null,
    "https://automorphic-six.vercel.app.attacker.test",
    "https://elsewhere.test",
  ]) {
    assert.equal(allowedWaitlistOrigin(value, allowed), null);
  }
});
