import assert from "node:assert/strict";
import test from "node:test";
import { handleUnsubscribeRequest } from "../src/lib/unsubscribe-service.js";
import { handleWaitlistSubmission } from "../src/lib/waitlist-service.js";

const baseEnv = {
  WAITLIST_ALLOWED_ORIGINS: "https://toyb.space",
  WAITLIST_IP_SALT: "test-ip-salt",
  WAITLIST_UNSUBSCRIBE_SECRET: "test-unsubscribe-secret",
  WAITLIST_UNSUBSCRIBE_BASE_URL: "https://toyb.space",
};

function createWaitlistDeps() {
  const rows = new Map();
  return {
    rows,
    deps: {
      rateLimitStore: new Map(),
      upsertWaitlist: async (input) => {
        const existing = rows.get(input.email);
        if (!existing) {
          rows.set(input.email, {
            marketingConsent: input.marketingConsent,
            privacyVersion: input.privacyVersion,
          });
          return { inserted: true, updated: false };
        }

        let updated = false;
        if (!existing.marketingConsent && input.marketingConsent) {
          existing.marketingConsent = true;
          updated = true;
        }
        if (existing.privacyVersion !== input.privacyVersion) {
          existing.privacyVersion = input.privacyVersion;
          updated = true;
        }

        rows.set(input.email, existing);
        return { inserted: false, updated };
      },
      sendEmail: async () => ({ ok: true }),
    },
  };
}

test("waitlist handler returns email_sent=true in mock email mode", async () => {
  const { deps } = createWaitlistDeps();
  const payload = {
    email: "api-test@example.com",
    source: "api-test",
    company: "",
    age_confirmed: true,
    privacy_accepted: true,
    marketing_consent: false,
    privacy_version: "2026-02-25",
  };

  const result = await handleWaitlistSubmission({
    payload,
    requestMeta: {
      origin: "https://toyb.space",
      ip: "1.1.1.1",
      userAgent: "test-suite",
      requestUrl: "https://toyb.space/api/waitlist",
    },
    env: baseEnv,
    deps,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ok");
  assert.equal(result.body.email_sent, true);
  assert.equal(result.body.inserted, true);
});

test("waitlist handler rejects missing required consents", async () => {
  const { deps } = createWaitlistDeps();

  const result = await handleWaitlistSubmission({
    payload: {
      email: "api-test-consent@example.com",
      source: "api-test",
      company: "",
      age_confirmed: false,
      privacy_accepted: true,
      marketing_consent: false,
      privacy_version: "2026-02-25",
    },
    requestMeta: {
      origin: "https://toyb.space",
      ip: "1.1.1.1",
      userAgent: "test-suite",
      requestUrl: "https://toyb.space/api/waitlist",
    },
    env: baseEnv,
    deps,
  });

  assert.equal(result.status, 400);
  assert.equal(result.body.status, "error");
  assert.equal(result.body.code, "age_required");
});

test("unsubscribe handler rejects invalid signature", async () => {
  let applied = false;

  const result = await handleUnsubscribeRequest({
    query: {
      email: "api-test@example.com",
      scope: "marketing",
      ts: String(Math.floor(Date.now() / 1000)),
      sig: "invalid",
    },
    requestMeta: {
      ip: "1.1.1.1",
    },
    env: {
      WAITLIST_UNSUBSCRIBE_SECRET: "test-unsubscribe-secret",
      WAITLIST_IP_SALT: "test-ip-salt",
    },
    deps: {
      invalidAttemptStore: new Map(),
      applyUnsubscribe: async () => {
        applied = true;
      },
    },
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.status, "error");
  assert.equal(result.body.error, "invalid_signature");
  assert.equal(applied, false);
});
