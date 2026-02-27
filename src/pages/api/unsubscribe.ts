import { createClient } from "@supabase/supabase-js";
import type { APIContext, APIRoute } from "astro";
import { handleUnsubscribeRequest } from "../../lib/unsubscribe-service.js";

export const prerender = false;

interface UnsubscribeRuntimeEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  WAITLIST_IP_SALT?: string;
  WAITLIST_UNSUBSCRIBE_SECRET?: string;
}

const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toParamString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const json = (
  body: Record<string, unknown>,
  status: number,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const getRuntimeEnv = (context: APIContext): UnsubscribeRuntimeEnv => {
  const runtime = (
    context.locals as { runtime?: { env?: UnsubscribeRuntimeEnv } }
  ).runtime?.env;
  const staticEnv = import.meta.env as unknown as UnsubscribeRuntimeEnv;
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

const MAX_BODY_BYTES = 2 * 1024;

const runUnsubscribe = async (
  context: APIContext,
  payload: { email?: string; scope?: string; ts?: string; sig?: string },
): Promise<Response> => {
  const env = getRuntimeEnv(context);
  const supabaseUrl = cleanString(env.SUPABASE_URL);
  const supabaseAnonKey = cleanString(env.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ status: "error", error: "server_error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const invalidAttemptStore =
    (globalThis as { __toybUnsubscribeRateStore?: Map<string, { count: number; resetAt: number }> })
      .__toybUnsubscribeRateStore ??
    new Map<string, { count: number; resetAt: number }>();
  (globalThis as { __toybUnsubscribeRateStore?: Map<string, { count: number; resetAt: number }> })
    .__toybUnsubscribeRateStore = invalidAttemptStore;

  const result = await handleUnsubscribeRequest({
    query: payload,
    requestMeta: {
      ip: getClientIp(context.request),
    },
    env,
    deps: {
      invalidAttemptStore,
      applyUnsubscribe: async (input) => {
        const { error } = await supabase.rpc("waitlist_apply_unsubscribe", {
          p_email: input.email,
          p_scope: input.scope,
        });

        if (error) {
          throw error;
        }
      },
    },
  });

  return json(result.body, result.status);
};

export const GET: APIRoute = async (context) => {
  const url = new URL(context.request.url);
  return runUnsubscribe(context, {
    email: url.searchParams.get("email") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    ts: url.searchParams.get("ts") ?? undefined,
    sig: url.searchParams.get("sig") ?? undefined,
  });
};

export const POST: APIRoute = async (context) => {
  const contentType = cleanString(
    context.request.headers.get("content-type"),
  ).toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return json({ status: "error", error: "invalid_signature" }, 400);
  }

  const bodyText = await parseBodyWithLimit(context.request, MAX_BODY_BYTES);
  if (bodyText === null || !bodyText) {
    return json({ status: "error", error: "invalid_signature" }, 400);
  }

  let payload: { email?: unknown; scope?: unknown; ts?: unknown; sig?: unknown };
  try {
    payload = JSON.parse(bodyText) as {
      email?: unknown;
      scope?: unknown;
      ts?: unknown;
      sig?: unknown;
    };
  } catch {
    return json({ status: "error", error: "invalid_signature" }, 400);
  }

  return runUnsubscribe(context, {
    email: toParamString(payload.email) || undefined,
    scope: toParamString(payload.scope) || undefined,
    ts: toParamString(payload.ts) || undefined,
    sig: toParamString(payload.sig) || undefined,
  });
};

export const ALL: APIRoute = async () =>
  json(
    {
      status: "error",
      code: "invalid_request",
    },
    405,
  );
