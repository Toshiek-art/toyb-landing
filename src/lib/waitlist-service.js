import { buildSignedUnsubscribeUrl } from "./unsubscribe-token.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;
const RATE_LIMIT_MAX_REQUESTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://toyb.space",
  "https://www.toyb.space",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeEmail = (value) => cleanString(value).toLowerCase();

const parseBoolean = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  return null;
};

const parseSource = (value) => {
  const source = cleanString(value);
  if (!source) return "landing";
  return source.slice(0, 64);
};

const parsePrivacyVersion = (value) => {
  const version = cleanString(value);
  if (!version) return null;
  return version.slice(0, 64);
};

const isValidEmail = (email) =>
  email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);

const parseAllowedOrigins = (value) => {
  const candidates = cleanString(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized = candidates.length > 0 ? candidates : DEFAULT_ALLOWED_ORIGINS;
  const out = new Set();

  for (const origin of normalized) {
    try {
      out.add(new URL(origin).origin);
    } catch {
      // ignore invalid origin values
    }
  }

  return out;
};

const normalizeOrigin = (origin) => {
  try {
    return new URL(cleanString(origin)).origin;
  } catch {
    return "";
  }
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const makeIpHash = async (ip, salt) => sha256Hex(`${ip}:${salt}`);

const isRateLimited = (store, key, now = Date.now()) => {
  for (const [entryKey, entryValue] of store.entries()) {
    if (entryValue.resetAt <= now) {
      store.delete(entryKey);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  existing.count += 1;
  return false;
};

export async function handleWaitlistSubmission({
  payload,
  requestMeta,
  env,
  deps,
}) {
  const allowedOrigins = parseAllowedOrigins(env.WAITLIST_ALLOWED_ORIGINS);
  const origin = normalizeOrigin(requestMeta.origin);

  if (!origin || !allowedOrigins.has(origin)) {
    return {
      status: 403,
      body: { status: "error", code: "forbidden_origin" },
      origin: null,
    };
  }

  const company = cleanString(payload.company);
  if (company) {
    return {
      status: 200,
      body: {
        status: "ok",
        email: "hidden",
        inserted: false,
        updated: false,
        email_sent: true,
      },
      origin,
    };
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: { status: "error", code: "invalid_request" },
      origin,
    };
  }

  const ageConfirmed = parseBoolean(payload.age_confirmed);
  if (ageConfirmed !== true) {
    return {
      status: 400,
      body: { status: "error", code: "age_required" },
      origin,
    };
  }

  const privacyAccepted = parseBoolean(payload.privacy_accepted);
  if (privacyAccepted !== true) {
    return {
      status: 400,
      body: { status: "error", code: "privacy_required" },
      origin,
    };
  }

  const marketingConsent = parseBoolean(payload.marketing_consent);
  if (marketingConsent === null) {
    return {
      status: 400,
      body: { status: "error", code: "invalid_request" },
      origin,
    };
  }

  const privacyVersion = parsePrivacyVersion(payload.privacy_version);
  if (!privacyVersion) {
    return {
      status: 400,
      body: { status: "error", code: "invalid_request" },
      origin,
    };
  }

  const ip = cleanString(requestMeta.ip) || "unknown";
  const ipSalt = cleanString(env.WAITLIST_IP_SALT) || "waitlist-default-salt";
  const ipHash = await makeIpHash(ip, ipSalt);

  const rateLimitStore = deps.rateLimitStore ?? new Map();
  if (isRateLimited(rateLimitStore, ipHash)) {
    return {
      status: 429,
      body: { status: "error", code: "rate_limited" },
      origin,
    };
  }

  let upsertResult;
  try {
    upsertResult = await deps.upsertWaitlist({
      email,
      source: parseSource(payload.source),
      userAgent: cleanString(requestMeta.userAgent) || null,
      ipHash,
      marketingConsent,
      privacyVersion,
    });
  } catch {
    return {
      status: 500,
      body: { status: "error", code: "server_error" },
      origin,
    };
  }

  const unsubscribeSecret = cleanString(env.WAITLIST_UNSUBSCRIBE_SECRET);
  const unsubscribeBaseUrl =
    cleanString(env.WAITLIST_UNSUBSCRIBE_BASE_URL) || cleanString(requestMeta.requestUrl);

  let emailSent = false;
  let emailErrorCode;

  if (!unsubscribeSecret || !unsubscribeBaseUrl) {
    emailErrorCode = "misconfigured_email";
  } else {
    try {
      const unsubscribeUrl = buildSignedUnsubscribeUrl({
        baseUrl: unsubscribeBaseUrl,
        secret: unsubscribeSecret,
        email,
        scope: "marketing",
      });

      const emailResult = await deps.sendEmail({
        to: email,
        marketingConsent,
        unsubscribeUrl,
      });

      emailSent = emailResult.ok;
      emailErrorCode = emailResult.error_code;
    } catch {
      emailSent = false;
      emailErrorCode = "misconfigured_email";
    }
  }

  return {
    status: 200,
    body: {
      status: "ok",
      email,
      inserted: upsertResult.inserted === true,
      updated: upsertResult.updated === true,
      email_sent: emailSent,
      ...(emailErrorCode ? { email_error_code: emailErrorCode } : {}),
    },
    origin,
  };
}
