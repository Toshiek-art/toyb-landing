import { signUnsubscribeToken } from "../src/lib/unsubscribe-token.js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const ORIGIN = process.env.WAITLIST_TEST_ORIGIN ?? "https://toyb.space";
const PRIVACY_VERSION = process.env.WAITLIST_TEST_PRIVACY_VERSION ?? "2026-02-25";
const UNSUBSCRIBE_SECRET =
  process.env.WAITLIST_UNSUBSCRIBE_SECRET ?? "test-unsubscribe-secret";

const runTag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const primaryEmail = `waitlist-smoke-${runTag}@example.com`;

const results = [];
let failures = 0;

const endpoint = `${BASE_URL.replace(/\/$/, "")}/api/waitlist`;
const unsubscribeEndpoint = `${BASE_URL.replace(/\/$/, "")}/api/unsubscribe`;

function record(label, ok, details = "") {
  results.push({ label, ok, details });
  if (!ok) failures += 1;
}

function assert(label, condition, details) {
  record(label, Boolean(condition), details);
}

async function postWaitlist(payload) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body: json };
  } catch {
    return {
      status: 0,
      ok: false,
      body: null,
      networkError: "fetch_failed",
    };
  }
}

async function getUnsubscribe(params) {
  const url = new URL(unsubscribeEndpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
    });

    const json = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body: json };
  } catch {
    return {
      status: 0,
      ok: false,
      body: null,
      networkError: "fetch_failed",
    };
  }
}

async function main() {
  console.log(
    `Waitlist smoke test -> endpoint=${endpoint} origin=${ORIGIN} run=${runTag}`,
  );

  const requestBase = {
    source: "smoke-test",
    age_confirmed: true,
    privacy_accepted: true,
    marketing_consent: false,
    privacy_version: PRIVACY_VERSION,
  };

  const first = await postWaitlist({
    ...requestBase,
    email: primaryEmail,
    company: "",
  });
  assert(
    "1) New email accepted and email sent",
    first.status === 200 &&
      first.body?.status === "ok" &&
      first.body?.inserted === true &&
      first.body?.email_sent === true,
    `status=${first.status} networkError=${first.networkError ?? "none"} body=${JSON.stringify(first.body)}`,
  );

  const second = await postWaitlist({
    ...requestBase,
    email: primaryEmail,
    company: "",
  });
  assert(
    "2) Duplicate email still returns ok",
    second.status === 200 &&
      second.body?.status === "ok" &&
      second.body?.inserted === false,
    `status=${second.status} networkError=${second.networkError ?? "none"} body=${JSON.stringify(second.body)}`,
  );

  const missingAge = await postWaitlist({
    ...requestBase,
    email: `waitlist-smoke-age-${runTag}@example.com`,
    company: "",
    age_confirmed: false,
  });
  assert(
    "3) Missing age consent is rejected",
    missingAge.status === 400 &&
      missingAge.body?.status === "error" &&
      missingAge.body?.code === "age_required",
    `status=${missingAge.status} networkError=${missingAge.networkError ?? "none"} body=${JSON.stringify(missingAge.body)}`,
  );

  const missingPrivacy = await postWaitlist({
    ...requestBase,
    email: `waitlist-smoke-privacy-${runTag}@example.com`,
    company: "",
    privacy_accepted: false,
  });
  assert(
    "4) Missing privacy consent is rejected",
    missingPrivacy.status === 400 &&
      missingPrivacy.body?.status === "error" &&
      missingPrivacy.body?.code === "privacy_required",
    `status=${missingPrivacy.status} networkError=${missingPrivacy.networkError ?? "none"} body=${JSON.stringify(missingPrivacy.body)}`,
  );

  const invalidUnsubscribe = await getUnsubscribe({
    email: primaryEmail,
    scope: "marketing",
    ts: Math.floor(Date.now() / 1000),
    sig: "invalid",
  });
  assert(
    "5) Unsubscribe rejects invalid signature",
    invalidUnsubscribe.status === 403 &&
      invalidUnsubscribe.body?.status === "error" &&
      invalidUnsubscribe.body?.error === "invalid_signature",
    `status=${invalidUnsubscribe.status} networkError=${invalidUnsubscribe.networkError ?? "none"} body=${JSON.stringify(invalidUnsubscribe.body)}`,
  );

  const ts = Math.floor(Date.now() / 1000);
  const sig = signUnsubscribeToken({
    secret: UNSUBSCRIBE_SECRET,
    email: primaryEmail,
    scope: "marketing",
    ts,
  });
  const validUnsubscribe = await getUnsubscribe({
    email: primaryEmail,
    scope: "marketing",
    ts,
    sig,
  });
  assert(
    "6) Unsubscribe accepts valid signature",
    validUnsubscribe.status === 200 && validUnsubscribe.body?.status === "ok",
    `status=${validUnsubscribe.status} networkError=${validUnsubscribe.networkError ?? "none"} body=${JSON.stringify(validUnsubscribe.body)}`,
  );

  console.log("");
  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    console.log(`[${mark}] ${result.label}`);
    if (!result.ok) {
      console.log(`       ${result.details}`);
    }
  }

  if (failures > 0) {
    console.log(`\nSmoke test failed (${failures} assertion(s)).`);
    process.exit(1);
  }

  console.log("\nSmoke test passed.");
}

await main();
