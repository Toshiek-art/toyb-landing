const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const ORIGIN = process.env.WAITLIST_TEST_ORIGIN ?? "https://toyb.space";
const TURNSTILE_TOKEN = process.env.TURNSTILE_TOKEN ?? "";

const runTag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const primaryEmail = `waitlist-smoke-${runTag}@example.com`;
const honeypotEmail = `waitlist-smoke-hp-${runTag}@example.com`;

const results = [];
let failures = 0;

const endpoint = `${BASE_URL.replace(/\/$/, "")}/api/waitlist`;

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

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

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
    turnstileToken: TURNSTILE_TOKEN,
  };

  const first = await postWaitlist({
    ...requestBase,
    email: primaryEmail,
    company: "",
  });
  assert(
    "1) New email accepted",
    first.status === 200 &&
      first.body?.ok === true &&
      first.body?.already_joined === false,
    `status=${first.status} networkError=${first.networkError ?? "none"} body=${JSON.stringify(first.body)}`,
  );

  const second = await postWaitlist({
    ...requestBase,
    email: primaryEmail,
    company: "",
  });
  assert(
    "2) Duplicate email marked as already_joined",
    second.status === 200 &&
      second.body?.ok === true &&
      second.body?.already_joined === true,
    `status=${second.status} networkError=${second.networkError ?? "none"} body=${JSON.stringify(second.body)}`,
  );

  const honeypot = await postWaitlist({
    ...requestBase,
    email: honeypotEmail,
    company: "Bot Company",
  });
  assert(
    "3) Honeypot request ignored",
    honeypot.status === 200 &&
      honeypot.body?.ok === true &&
      (honeypot.body?.already_joined === false ||
        honeypot.body?.ignored === true),
    `status=${honeypot.status} networkError=${honeypot.networkError ?? "none"} body=${JSON.stringify(honeypot.body)}`,
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
    if (
      results.some(
        (result) =>
          !result.ok &&
          result.details.includes('"error":"bot_suspected"') &&
          !TURNSTILE_TOKEN,
      )
    ) {
      console.log(
        "Hint: Turnstile may be enabled. Set TURNSTILE_TOKEN for this smoke test.",
      );
    }
    process.exit(1);
  }

  console.log("\nSmoke test passed.");
}

await main();
