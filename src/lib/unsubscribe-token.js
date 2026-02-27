import { createHmac, timingSafeEqual } from "node:crypto";

export const UNSUBSCRIBE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_SCOPES = new Set(["all", "marketing"]);

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeEmail = (value) => cleanString(value).toLowerCase();

const normalizeScope = (value) => {
  const normalized = cleanString(value).toLowerCase();
  return ALLOWED_SCOPES.has(normalized) ? normalized : "";
};

const parseUnixSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed <= 0) return null;
  return parsed;
};

const normalizeSecret = (value) => cleanString(value);

const signaturePayload = (email, scope, ts) => `${email}|${scope}|${ts}`;

export const signUnsubscribeToken = ({ secret, email, scope, ts }) => {
  const normalizedSecret = normalizeSecret(secret);
  const normalizedEmail = normalizeEmail(email);
  const normalizedScope = normalizeScope(scope);
  const parsedTs = parseUnixSeconds(ts);

  if (!normalizedSecret || !normalizedEmail || !normalizedScope || parsedTs === null) {
    throw new Error("invalid_unsubscribe_signature_input");
  }

  return createHmac("sha256", normalizedSecret)
    .update(signaturePayload(normalizedEmail, normalizedScope, parsedTs), "utf8")
    .digest("hex");
};

const isHexSignature = (value) => /^[0-9a-f]{64}$/.test(value);

// Security decision: always use timingSafeEqual for signature checks.
export const timingSafeHexEqual = (expectedHex, providedHex) => {
  const expected = cleanString(expectedHex).toLowerCase();
  const provided = cleanString(providedHex).toLowerCase();

  if (!isHexSignature(expected) || !isHexSignature(provided)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export const verifyUnsubscribeToken = ({
  secret,
  email,
  scope,
  ts,
  sig,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = UNSUBSCRIBE_TTL_SECONDS,
}) => {
  const normalizedSecret = normalizeSecret(secret);
  const normalizedEmail = normalizeEmail(email);
  const normalizedScope = normalizeScope(scope);
  const parsedTs = parseUnixSeconds(ts);
  const parsedNow = parseUnixSeconds(nowSeconds);

  if (!normalizedSecret || !normalizedEmail || !normalizedScope || parsedTs === null || parsedNow === null) {
    return { ok: false, reason: "invalid" };
  }

  if (parsedTs > parsedNow + 300) {
    return { ok: false, reason: "invalid" };
  }

  if (parsedNow - parsedTs > ttlSeconds) {
    return { ok: false, reason: "expired" };
  }

  let expected;
  try {
    expected = signUnsubscribeToken({
      secret: normalizedSecret,
      email: normalizedEmail,
      scope: normalizedScope,
      ts: parsedTs,
    });
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (!timingSafeHexEqual(expected, sig)) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    email: normalizedEmail,
    scope: normalizedScope,
    ts: parsedTs,
  };
};

export const buildSignedUnsubscribeUrl = ({
  baseUrl,
  secret,
  email,
  scope = "marketing",
  ts = Math.floor(Date.now() / 1000),
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedScope = normalizeScope(scope);

  if (!normalizedEmail || !normalizedScope) {
    throw new Error("invalid_unsubscribe_url_input");
  }

  const signature = signUnsubscribeToken({
    secret,
    email: normalizedEmail,
    scope: normalizedScope,
    ts,
  });

  const url = new URL("/unsubscribe", baseUrl);
  url.searchParams.set("email", normalizedEmail);
  url.searchParams.set("scope", normalizedScope);
  url.searchParams.set("ts", String(ts));
  url.searchParams.set("sig", signature);
  return url.toString();
};
