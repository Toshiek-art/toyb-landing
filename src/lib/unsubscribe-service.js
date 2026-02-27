import {
  verifyUnsubscribeToken,
} from "./unsubscribe-token.js";
import { trackServerEvent } from "./server-analytics.js";

const INVALID_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const INVALID_ATTEMPT_MAX = 12;

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const consumeInvalidAttempt = (store, key, now = Date.now()) => {
  for (const [entryKey, entryValue] of store.entries()) {
    if (entryValue.resetAt <= now) {
      store.delete(entryKey);
    }
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + INVALID_ATTEMPT_WINDOW_MS,
    });
    return false;
  }

  existing.count += 1;
  return existing.count > INVALID_ATTEMPT_MAX;
};

export async function handleUnsubscribeRequest({
  query,
  requestMeta,
  env,
  deps,
}) {
  const unsubscribeSecret = cleanString(env.WAITLIST_UNSUBSCRIBE_SECRET);
  if (!unsubscribeSecret) {
    return { status: 500, body: { status: "error", error: "server_error" } };
  }

  const ipSalt = cleanString(env.WAITLIST_IP_SALT) || "unsubscribe-default-salt";
  const ip = cleanString(requestMeta.ip) || "unknown";
  const ipHash = await sha256Hex(`${ip}:${ipSalt}`);

  const verified = verifyUnsubscribeToken({
    secret: unsubscribeSecret,
    email: query.email,
    scope: query.scope,
    ts: query.ts,
    sig: query.sig,
  });

  if (!verified.ok) {
    const store = deps.invalidAttemptStore ?? new Map();
    const rateLimited = consumeInvalidAttempt(store, ipHash);

    console.warn("[unsubscribe]", {
      stage: "token_rejected",
      reason: verified.reason,
      ip_hash_prefix: ipHash.slice(0, 8),
      rate_limited: rateLimited,
    });
    trackServerEvent("unsubscribe_invalid", {
      reason: verified.reason,
    });

    return {
      status: 403,
      body: {
        status: "error",
        error: verified.reason === "expired" ? "expired" : "invalid_signature",
      },
    };
  }

  try {
    await deps.applyUnsubscribe({
      email: verified.email,
      scope: verified.scope,
    });
    trackServerEvent("unsubscribe_valid", {
      scope: verified.scope,
    });
  } catch {
    return { status: 500, body: { status: "error", error: "server_error" } };
  }

  return { status: 200, body: { status: "ok" } };
}
