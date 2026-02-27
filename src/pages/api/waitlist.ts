import { createClient } from "@supabase/supabase-js";
import type { APIContext, APIRoute } from "astro";
import {
  sendWaitlistEmail,
  type WaitlistEmailEnv,
} from "../../lib/email";
import { handleWaitlistSubmission } from "../../lib/waitlist-service.js";

export const prerender = false;

interface WaitlistRuntimeEnv extends WaitlistEmailEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  WAITLIST_IP_SALT?: string;
  WAITLIST_ALLOWED_ORIGINS?: string;
  WAITLIST_UNSUBSCRIBE_SECRET?: string;
  WAITLIST_UNSUBSCRIBE_BASE_URL?: string;
}

interface WaitlistPayload {
  email?: unknown;
  source?: unknown;
  company?: unknown;
  age_confirmed?: unknown;
  privacy_accepted?: unknown;
  marketing_consent?: unknown;
  privacy_version?: unknown;
}

const MAX_BODY_BYTES = 2 * 1024;

const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://toyb.space",
  "https://www.toyb.space",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

const parseAllowedOrigins = (value: string): Set<string> => {
  const candidates = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized = candidates.length > 0 ? candidates : DEFAULT_ALLOWED_ORIGINS;
  const out = new Set<string>();

  for (const origin of normalized) {
    try {
      out.add(new URL(origin).origin);
    } catch {
      // Ignore malformed configured values.
    }
  }

  return out;
};

const getAllowedOrigin = (origin: string, allowedOrigins: Set<string>): string | null => {
  if (!origin) return null;
  try {
    const parsed = new URL(origin).origin;
    return allowedOrigins.has(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const buildResponseHeaders = (allowedOrigin?: string): Headers => {
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

  return headers;
};

const json = (
  body: Record<string, unknown>,
  status: number,
  allowedOrigin?: string,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: buildResponseHeaders(allowedOrigin),
  });

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

const getRuntimeEnv = (context: APIContext): WaitlistRuntimeEnv => {
  const runtime = (context.locals as { runtime?: { env?: WaitlistRuntimeEnv } })
    .runtime?.env;
  const staticEnv = import.meta.env as unknown as WaitlistRuntimeEnv;
  return {
    ...staticEnv,
    ...runtime,
  };
};

const getClientIp = (request: Request): string => {
  const cfIp = cleanString(request.headers.get("cf-connecting-ip"));
  if (cfIp) return cfIp;

  const forwarded = cleanString(request.headers.get("x-forwarded-for"));
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
};

export const OPTIONS: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const allowedOrigins = parseAllowedOrigins(
    cleanString(env.WAITLIST_ALLOWED_ORIGINS),
  );
  const allowedOrigin = getAllowedOrigin(
    cleanString(context.request.headers.get("origin")),
    allowedOrigins,
  );

  if (!allowedOrigin) {
    return json({ status: "error", code: "forbidden_origin" }, 403);
  }

  return new Response(null, {
    status: 204,
    headers: buildResponseHeaders(allowedOrigin),
  });
};

export const ALL: APIRoute = async (context) => {
  const allowedOrigin = cleanString(context.request.headers.get("origin")) || undefined;
  return json({ status: "error", code: "invalid_request" }, 405, allowedOrigin);
};

export const POST: APIRoute = async (context) => {
  const env = getRuntimeEnv(context);
  const supabaseUrl = cleanString(env.SUPABASE_URL);
  const supabaseAnonKey = cleanString(env.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ status: "error", code: "server_error" }, 500);
  }

  const contentType = cleanString(
    context.request.headers.get("content-type"),
  ).toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return json({ status: "error", code: "invalid_request" }, 415);
  }

  const bodyText = await parseBodyWithLimit(context.request, MAX_BODY_BYTES);
  if (bodyText === null || bodyText.length === 0) {
    return json({ status: "error", code: "invalid_request" }, 400);
  }

  let payload: WaitlistPayload;
  try {
    payload = JSON.parse(bodyText) as WaitlistPayload;
  } catch {
    return json({ status: "error", code: "invalid_request" }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const rateLimitStore =
    (globalThis as { __toybWaitlistRateStore?: Map<string, { count: number; resetAt: number }> })
      .__toybWaitlistRateStore ??
    new Map<string, { count: number; resetAt: number }>();
  (globalThis as { __toybWaitlistRateStore?: Map<string, { count: number; resetAt: number }> })
    .__toybWaitlistRateStore = rateLimitStore;

  const result = await handleWaitlistSubmission({
    payload,
    requestMeta: {
      origin: cleanString(context.request.headers.get("origin")),
      ip: getClientIp(context.request),
      userAgent: cleanString(context.request.headers.get("user-agent")) || null,
      requestUrl: context.request.url,
    },
    env,
    deps: {
      rateLimitStore,
      upsertWaitlist: async (input) => {
        const { data, error } = await supabase.rpc("waitlist_upsert", {
          p_email: input.email,
          p_source: input.source,
          p_user_agent: input.userAgent,
          p_ip_hash: input.ipHash,
          p_age_confirmed: true,
          p_privacy_accepted: true,
          p_marketing_consent: input.marketingConsent,
          p_privacy_version: input.privacyVersion,
        });

        if (error) throw error;

        const row = Array.isArray(data)
          ? (data[0] as { inserted?: boolean; updated?: boolean } | undefined)
          : undefined;

        return {
          inserted: row?.inserted === true,
          updated: row?.updated === true,
        };
      },
      sendEmail: async (input) => {
        const response = await sendWaitlistEmail({
          to: input.to,
          marketingConsent: input.marketingConsent,
          unsubscribeUrl: input.unsubscribeUrl,
          env,
        });

        return {
          ok: response.ok,
          error_code: response.error_code,
        };
      },
    },
  });

  return json(
    result.body,
    result.status,
    result.origin ?? undefined,
  );
};
