const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const ADMIN_TOKEN = process.env.WAITLIST_ADMIN_TOKEN ?? "";
const TARGET_EMAIL = process.env.WAITLIST_TEST_EMAIL ?? "";

const endpoint = `${BASE_URL.replace(/\/$/, "")}/api/waitlist-test`;

const maskEmail = (email) => {
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "invalid";
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
};

if (!ADMIN_TOKEN || !TARGET_EMAIL) {
  console.error("Missing required env vars:");
  console.error("  WAITLIST_ADMIN_TOKEN");
  console.error("  WAITLIST_TEST_EMAIL");
  process.exit(1);
}

const targetMasked = maskEmail(TARGET_EMAIL);
console.log(`Calling ${endpoint} target=${targetMasked}`);

let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": ADMIN_TOKEN,
    },
    body: JSON.stringify({
      email: TARGET_EMAIL,
    }),
  });
} catch {
  console.error("Request failed (network error).");
  process.exit(1);
}

const body = await response.json().catch(() => null);

console.log(
  JSON.stringify(
    {
      status: response.status,
      request_id: body?.request_id ?? null,
      ok: body?.ok ?? false,
      email_sent: body?.email_sent ?? false,
      error: body?.error ?? null,
      error_code: body?.error_code ?? null,
    },
    null,
    2,
  ),
);

if (!response.ok || body?.email_sent !== true) {
  process.exit(1);
}
