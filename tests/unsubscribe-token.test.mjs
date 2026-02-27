import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignedUnsubscribeUrl,
  signUnsubscribeToken,
  timingSafeHexEqual,
  verifyUnsubscribeToken,
} from "../src/lib/unsubscribe-token.js";

test("verifyUnsubscribeToken accepts valid signature", () => {
  const secret = "token-test-secret";
  const email = "user@example.com";
  const scope = "marketing";
  const ts = 1_700_000_000;
  const sig = signUnsubscribeToken({ secret, email, scope, ts });

  const result = verifyUnsubscribeToken({
    secret,
    email,
    scope,
    ts,
    sig,
    nowSeconds: ts + 10,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.email, email);
    assert.equal(result.scope, scope);
    assert.equal(result.ts, ts);
  }
});

test("verifyUnsubscribeToken rejects invalid signature", () => {
  const result = verifyUnsubscribeToken({
    secret: "token-test-secret",
    email: "user@example.com",
    scope: "marketing",
    ts: 1_700_000_000,
    sig: "deadbeef",
    nowSeconds: 1_700_000_100,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid");
  }
});

test("verifyUnsubscribeToken rejects expired signature", () => {
  const secret = "token-test-secret";
  const email = "user@example.com";
  const scope = "all";
  const ts = 1_700_000_000;
  const sig = signUnsubscribeToken({ secret, email, scope, ts });

  const result = verifyUnsubscribeToken({
    secret,
    email,
    scope,
    ts,
    sig,
    nowSeconds: ts + 8 * 24 * 60 * 60,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "expired");
  }
});

test("timingSafeHexEqual compares signatures safely", () => {
  const secret = "token-test-secret";
  const sig = signUnsubscribeToken({
    secret,
    email: "user@example.com",
    scope: "marketing",
    ts: 1_700_000_000,
  });

  assert.equal(timingSafeHexEqual(sig, sig), true);
  assert.equal(timingSafeHexEqual(sig, "0".repeat(64)), false);
});

test("buildSignedUnsubscribeUrl points to /unsubscribe", () => {
  const url = buildSignedUnsubscribeUrl({
    baseUrl: "https://toyb.space",
    secret: "token-test-secret",
    email: "user@example.com",
    scope: "marketing",
    ts: 1_700_000_000,
  });

  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/unsubscribe");
  assert.equal(parsed.searchParams.get("email"), "user@example.com");
});
