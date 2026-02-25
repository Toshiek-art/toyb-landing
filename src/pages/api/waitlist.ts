import { createClient } from "@supabase/supabase-js";
import type { APIContext, APIRoute } from "astro";
import {
  getWaitlistEmailProvider,
  sendWaitlistWelcomeEmail,
  type EmailProvider,
} from "../../lib/email";

export const prerender = false;

interface WaitlistRequestBody {
  email?: unknown;
  source?: unknown;
  company?: unknown;
  turnstileToken?: unknown;
}

interface WaitlistSuccessResponse {
  ok: true;
  already_joined: boolean;
  email_sent: boolean;
  request_id: string;
}

interface WaitlistErrorResponse {
  ok: false;
  error: ErrorCode;
  request_id: string;
  already_joined: false;
  email_sent: false;
}

interface WaitlistRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  WAITLIST_IP_SALT?: string;
  WAITLIST_FROM?: string;
  WAITLIST_EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_SECURE?: string;
  TURNSTILE_SECRET_KEY?: string;
  WAITLIST_TURNSTILE_ENABLED?: string;
  WAITLIST_SEND_ON_DUPLICATE?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

type ErrorCode =
  | "invalid_request"
  | "forbidden_origin"
  | "method_not_allowed"
  | "payload_too_large"
  | "rate_limited"
  | "bot_suspected"
  | "server_error";

interface WaitlistLogEntry {
  request_id: string;
  stage: string;
  provider: EmailProvider;
  email_sent: boolean;
  already_joined: boolean;
  error_code?: string;
  email_hash_prefix: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;
const MAX_BODY_BYTES = 2 * 1024;
const RATE_LIMIT_MAX_REQUESTS = 6;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://toyb.space",
  "https://www.toyb.space",
]);

// Soft limiter only: in-memory store is per runtime instance and not globally shared.
// For strict distributed limits on Cloudflare, move this to KV/Durable Objects.
const rateLimitStore = new Map<string, RateLimitEntry>();

const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  cleanString(value).toLowerCase();

const isValidEmail = (email: string): boolean =>
  email.length > 0 &&
  email.length <= MAX_EMAIL_LENGTH &&
  EMAIL_PATTERN.test(email);

const isAllowedOrigin = (origin: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (ALLOWED_ORIGINS.has(parsed.origin)) return true;

  const hostname = parsed.hostname.toLowerCase();
  return hostname.endsWith(".pages.dev");
};

const getAllowedOrigin = (request: Request): string | null => {
  const origin = cleanString(request.headers.get("origin"));
  if (!origin) return null;
  // Allow strict same-origin requests (useful for local development hosts).
  try {
    const requestOrigin = new URL(request.url).origin;
    if (origin === requestOrigin) return origin;
  } catch {
    // fall through
  }
  return isAllowedOrigin(origin) ? origin : null;
};

const buildResponseHeaders = (
  allowedOrigin?: string,
  extraHeaders?: Record<string, string>,
): Headers => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });

  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type");
    headers.set("vary", "Origin");
  }

  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) =>
      headers.set(key, value),
    );
  }

  return headers;
};

const json = (
  body: WaitlistSuccessResponse | WaitlistErrorResponse,
  status = 200,
  allowedOrigin?: string,
  extraHeaders?: Record<string, string>,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: buildResponseHeaders(allowedOrigin, extraHeaders),
  });

const getRuntimeEnv = (context: APIContext): WaitlistRuntimeEnv => {
  const runtime = (context.locals as { runtime?: { env?: WaitlistRuntimeEnv } })
    .runtime?.env;
  const staticEnv = import.meta.env as unknown as WaitlistRuntimeEnv;

  return {
    ...staticEnv,
    ...runtime,
  };
};

const getClientIp = (request: Request): string | null => {
  const cfIp = cleanString(request.headers.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  const forwarded = cleanString(request.headers.get("x-forwarded-for"));
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;

  return null;
};

const isRateLimited = (key: string, now = Date.now()): boolean => {
  for (const [entryKey, entryValue] of rateLimitStore.entries()) {
    if (entryValue.resetAt <= now) {
      rateLimitStore.delete(entryKey);
    }
  }

  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.count += 1;
  return false;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const makeIpHash = async (
  ip: string | null,
  salt?: string,
): Promise<string | null> => {
  const normalizedSalt = cleanString(salt);
  if (!ip || !normalizedSalt) return null;
  return sha256Hex(`${ip}:${normalizedSalt}`);
};

const makeEmailHash = async (
  email: string | null,
  salt?: string,
): Promise<string | null> => {
  const normalizedSalt = cleanString(salt);
  if (!email || !normalizedSalt) return null;
  return sha256Hex(`${email}:${normalizedSalt}`);
};

const prefix8 = (value: string | null): string =>
  value ? value.slice(0, 8) : "none";

const isTurnstileEnabled = (env: WaitlistRuntimeEnv): boolean =>
  cleanString(env.WAITLIST_TURNSTILE_ENABLED).toLowerCase() === "true";

const shouldSendOnDuplicate = (env: WaitlistRuntimeEnv): boolean =>
  cleanString(env.WAITLIST_SEND_ON_DUPLICATE).toLowerCase() === "true";

const logWaitlist = (
  level: "info" | "warn" | "error",
  entry: WaitlistLogEntry,
): void => {
  const payload = {
    request_id: entry.request_id,
    stage: entry.stage,
    provider: entry.provider,
    email_sent: entry.email_sent,
    already_joined: entry.already_joined,
    email_hash_prefix: entry.email_hash_prefix,
    ...(entry.error_code ? { error_code: entry.error_code } : {}),
  };
  if (level === "info") {
    console.info("[waitlist]", payload);
    return;
  }
  if (level === "warn") {
    console.warn("[waitlist]", payload);
    return;
  }
  console.error("[waitlist]", payload);
};

const verifyTurnstileToken = async (params: {
  secret: string;
  token: string;
  remoteIp: string | null;
}): Promise<boolean> => {
  const body = new URLSearchParams({
    secret: params.secret,
    response: params.token,
  });

  if (params.remoteIp) {
    body.set("remoteip", params.remoteIp);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    if (!response.ok) return false;

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
};

const parseBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
};

export const OPTIONS: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const allowedOrigin = getAllowedOrigin(request);
  if (!allowedOrigin) {
    return json(
      {
        ok: false,
        error: "forbidden_origin",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      403,
    );
  }

  return new Response(null, {
    status: 204,
    headers: buildResponseHeaders(allowedOrigin),
  });
};

export const ALL: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  const allowedOrigin = getAllowedOrigin(request) ?? undefined;
  return json(
    {
      ok: false,
      error: "method_not_allowed",
      request_id: requestId,
      already_joined: false,
      email_sent: false,
    },
    405,
    allowedOrigin,
    {
      allow: "POST, OPTIONS",
    },
  );
};

export const POST: APIRoute = async (context) => {
  const request = context.request;
  const env = getRuntimeEnv(context);
  const requestId = crypto.randomUUID();
  const provider = getWaitlistEmailProvider(env);
  const duplicateSendsEnabled = shouldSendOnDuplicate(env);

  logWaitlist("info", {
    request_id: requestId,
    stage: "request_received",
    provider,
    email_sent: false,
    already_joined: false,
    email_hash_prefix: "none",
  });

  // Missing Origin is rejected by design to reduce CSRF/cross-site abuse surface.
  const allowedOrigin = getAllowedOrigin(request);
  if (!allowedOrigin) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "forbidden_origin",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "forbidden_origin",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      403,
    );
  }

  const contentType = cleanString(
    request.headers.get("content-type"),
  ).toLowerCase();
  if (!contentType.startsWith("application/json")) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "invalid_request",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "invalid_request",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      415,
      allowedOrigin,
    );
  }

  const contentLengthHeader = cleanString(
    request.headers.get("content-length"),
  );
  if (contentLengthHeader) {
    const parsedLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_BODY_BYTES) {
      logWaitlist("warn", {
        request_id: requestId,
        stage: "request_rejected",
        provider,
        email_sent: false,
        already_joined: false,
        error_code: "payload_too_large",
        email_hash_prefix: "none",
      });
      return json(
        {
          ok: false,
          error: "payload_too_large",
          request_id: requestId,
          already_joined: false,
          email_sent: false,
        },
        413,
        allowedOrigin,
      );
    }
  }

  const supabaseUrl = cleanString(env.SUPABASE_URL);
  const supabaseAnonKey = cleanString(env.SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    logWaitlist("error", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "server_error",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "server_error",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      500,
      allowedOrigin,
    );
  }

  const clientIp = getClientIp(request);
  const userAgent = cleanString(request.headers.get("user-agent"));
  const ipHash = await makeIpHash(clientIp, env.WAITLIST_IP_SALT);

  let body: WaitlistRequestBody;
  const bodyText = await parseBodyWithLimit(request, MAX_BODY_BYTES);
  if (bodyText === null) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "payload_too_large",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "payload_too_large",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      413,
      allowedOrigin,
    );
  }

  if (!bodyText) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "invalid_request",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "invalid_request",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      400,
      allowedOrigin,
    );
  }

  try {
    body = JSON.parse(bodyText) as WaitlistRequestBody;
  } catch {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "invalid_request",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "invalid_request",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      400,
      allowedOrigin,
    );
  }

  const company = cleanString(body.company);
  if (company) {
    logWaitlist("info", {
      request_id: requestId,
      stage: "honeypot_tripped",
      provider,
      email_sent: false,
      already_joined: false,
      email_hash_prefix: "none",
    });
    // Honeypot trap: pretend success without storing/sending.
    return json(
      {
        ok: true,
        already_joined: false,
        email_sent: false,
        request_id: requestId,
      },
      200,
      allowedOrigin,
    );
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "invalid_request",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        error: "invalid_request",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      400,
      allowedOrigin,
    );
  }

  const emailHash = await makeEmailHash(email, env.WAITLIST_IP_SALT);
  const emailHashPrefix = prefix8(emailHash);

  const rateKey = clientIp ? `ip:${clientIp}` : `ua:${userAgent.slice(0, 80)}`;
  if (isRateLimited(rateKey)) {
    logWaitlist("warn", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "rate_limited",
      email_hash_prefix: emailHashPrefix,
    });
    return json(
      {
        ok: false,
        error: "rate_limited",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      429,
      allowedOrigin,
    );
  }

  if (isTurnstileEnabled(env)) {
    const turnstileToken = cleanString(body.turnstileToken);
    const turnstileSecret = cleanString(env.TURNSTILE_SECRET_KEY);

    if (!turnstileToken || !turnstileSecret) {
      logWaitlist("warn", {
        request_id: requestId,
        stage: "request_rejected",
        provider,
        email_sent: false,
        already_joined: false,
        error_code: "bot_suspected",
        email_hash_prefix: emailHashPrefix,
      });
      return json(
        {
          ok: false,
          error: "bot_suspected",
          request_id: requestId,
          already_joined: false,
          email_sent: false,
        },
        403,
        allowedOrigin,
      );
    }

    const verified = await verifyTurnstileToken({
      secret: turnstileSecret,
      token: turnstileToken,
      remoteIp: clientIp,
    });

    if (!verified) {
      logWaitlist("warn", {
        request_id: requestId,
        stage: "request_rejected",
        provider,
        email_sent: false,
        already_joined: false,
        error_code: "bot_suspected",
        email_hash_prefix: emailHashPrefix,
      });
      return json(
        {
          ok: false,
          error: "bot_suspected",
          request_id: requestId,
          already_joined: false,
          email_sent: false,
        },
        403,
        allowedOrigin,
      );
    }
  }

  const source = cleanString(body.source) || "landing";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let alreadyJoined: boolean;
  try {
    const { data, error } = await supabase.rpc("insert_waitlist", {
      p_email: email,
      p_source: source,
      p_user_agent: userAgent || null,
      p_ip_hash: ipHash,
    });

    if (error) {
      const rpcCode = cleanString((error as { code?: string }).code);
      if (rpcCode === "22023") {
        logWaitlist("warn", {
          request_id: requestId,
          stage: "request_rejected",
          provider,
          email_sent: false,
          already_joined: false,
          error_code: "invalid_request",
          email_hash_prefix: emailHashPrefix,
        });
        return json(
          {
            ok: false,
            error: "invalid_request",
            request_id: requestId,
            already_joined: false,
            email_sent: false,
          },
          400,
          allowedOrigin,
        );
      }
      throw error;
    }

    const row = Array.isArray(data)
      ? (data[0] as { already_joined?: boolean } | undefined)
      : undefined;
    alreadyJoined = row?.already_joined === true;
  } catch {
    logWaitlist("error", {
      request_id: requestId,
      stage: "insert_failed",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "server_error",
      email_hash_prefix: emailHashPrefix,
    });
    return json(
      {
        ok: false,
        error: "server_error",
        request_id: requestId,
        already_joined: false,
        email_sent: false,
      },
      500,
      allowedOrigin,
    );
  }

  logWaitlist("info", {
    request_id: requestId,
    stage: "insert_ok",
    provider,
    email_sent: false,
    already_joined: alreadyJoined,
    email_hash_prefix: emailHashPrefix,
  });

  const shouldAttemptEmail = !alreadyJoined || duplicateSendsEnabled;
  if (!shouldAttemptEmail) {
    logWaitlist("info", {
      request_id: requestId,
      stage: "email_skipped_duplicate",
      provider,
      email_sent: false,
      already_joined: true,
      email_hash_prefix: emailHashPrefix,
    });
    return json(
      {
        ok: true,
        already_joined: true,
        email_sent: false,
        request_id: requestId,
      },
      200,
      allowedOrigin,
    );
  }

  logWaitlist("info", {
    request_id: requestId,
    stage: "email_send_attempt",
    provider,
    email_sent: false,
    already_joined: alreadyJoined,
    email_hash_prefix: emailHashPrefix,
  });

  const emailResult = await sendWaitlistWelcomeEmail({
    to: email,
    env,
  });

  if (!emailResult.ok) {
    logWaitlist("error", {
      request_id: requestId,
      stage: "email_send_failed",
      provider: emailResult.provider,
      email_sent: false,
      already_joined: alreadyJoined,
      error_code: emailResult.error_code ?? "send_failed",
      email_hash_prefix: emailHashPrefix,
    });
  } else {
    logWaitlist("info", {
      request_id: requestId,
      stage: "email_send_succeeded",
      provider: emailResult.provider,
      email_sent: true,
      already_joined: alreadyJoined,
      email_hash_prefix: emailHashPrefix,
    });
  }

  return json(
    {
      ok: true,
      already_joined: alreadyJoined,
      email_sent: emailResult.ok,
      request_id: requestId,
    },
    200,
    allowedOrigin,
  );
};
