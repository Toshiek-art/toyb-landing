export const UNSUBSCRIBE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_SCOPES = new Set(["all", "marketing"]);
const textEncoder = new TextEncoder();

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

const bytesToHex = (bytes) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const importHmacKey = async (secret) =>
  crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

const hmacSha256Hex = async (secret, payload) => {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payload),
  );
  return bytesToHex(new Uint8Array(signature));
};

export const signUnsubscribeToken = async ({ secret, email, scope, ts }) => {
  const normalizedSecret = normalizeSecret(secret);
  const normalizedEmail = normalizeEmail(email);
  const normalizedScope = normalizeScope(scope);
  const parsedTs = parseUnixSeconds(ts);

  if (!normalizedSecret || !normalizedEmail || !normalizedScope || parsedTs === null) {
    throw new Error("invalid_unsubscribe_signature_input");
  }

  return hmacSha256Hex(
    normalizedSecret,
    signaturePayload(normalizedEmail, normalizedScope, parsedTs),
  );
};

const isHexSignature = (value) => /^[0-9a-f]{64}$/.test(value);

// Security decision: use a constant-time comparison for signature checks.
export const timingSafeHexEqual = (expectedHex, providedHex) => {
  const expected = cleanString(expectedHex).toLowerCase();
  const provided = cleanString(providedHex).toLowerCase();

  if (!isHexSignature(expected) || !isHexSignature(provided)) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }

  return diff === 0;
};

export const verifyUnsubscribeToken = async ({
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
    expected = await signUnsubscribeToken({
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

export const buildSignedUnsubscribeUrl = async ({
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

  const signature = await signUnsubscribeToken({
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
