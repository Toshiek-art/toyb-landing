import type { APIContext, APIRoute } from "astro";
import {
  getWaitlistEmailProvider,
  sendWaitlistWelcomeEmail,
  type WaitlistEmailEnv,
} from "../../lib/email";

export const prerender = false;

interface WaitlistTestRuntimeEnv extends WaitlistEmailEnv {
  WAITLIST_ADMIN_TOKEN?: string;
}

interface WaitlistTestRequestBody {
  email?: unknown;
}

type WaitlistTestErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "method_not_allowed";

interface WaitlistTestSuccessResponse {
  ok: true;
  request_id: string;
  email_sent: boolean;
  error_code?: string;
}

interface WaitlistTestErrorResponse {
  ok: false;
  request_id: string;
  email_sent: false;
  error: WaitlistTestErrorCode;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 2 * 1024;

const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  cleanString(value).toLowerCase();

const isValidEmail = (value: string): boolean =>
  value.length > 0 && value.length <= 320 && EMAIL_PATTERN.test(value);

const json = (
  body: WaitlistTestSuccessResponse | WaitlistTestErrorResponse,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const getRuntimeEnv = (context: APIContext): WaitlistTestRuntimeEnv => {
  const runtime = (
    context.locals as { runtime?: { env?: WaitlistTestRuntimeEnv } }
  ).runtime?.env;
  const staticEnv = import.meta.env as unknown as WaitlistTestRuntimeEnv;

  return {
    ...staticEnv,
    ...runtime,
  };
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

export const ALL: APIRoute = async () => {
  const requestId = crypto.randomUUID();
  return json(
    {
      ok: false,
      request_id: requestId,
      email_sent: false,
      error: "method_not_allowed",
    },
    405,
  );
};

export const POST: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const env = getRuntimeEnv(context);
  const provider = getWaitlistEmailProvider(env);
  const adminToken = cleanString(env.WAITLIST_ADMIN_TOKEN);
  const receivedAdminToken = cleanString(
    context.request.headers.get("x-admin-token"),
  );

  if (!adminToken || receivedAdminToken !== adminToken) {
    console.warn("[waitlist-test]", {
      request_id: requestId,
      stage: "request_rejected",
      provider,
      email_sent: false,
      already_joined: false,
      error_code: "unauthorized",
      email_hash_prefix: "none",
    });
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "unauthorized",
      },
      401,
    );
  }

  const contentType = cleanString(
    context.request.headers.get("content-type"),
  ).toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "invalid_request",
      },
      415,
    );
  }

  const bodyText = await parseBodyWithLimit(context.request, MAX_BODY_BYTES);
  if (bodyText === null) {
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "invalid_request",
      },
      413,
    );
  }
  if (!bodyText) {
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "invalid_request",
      },
      400,
    );
  }

  let payload: WaitlistTestRequestBody;
  try {
    payload = JSON.parse(bodyText) as WaitlistTestRequestBody;
  } catch {
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "invalid_request",
      },
      400,
    );
  }

  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) {
    return json(
      {
        ok: false,
        request_id: requestId,
        email_sent: false,
        error: "invalid_request",
      },
      400,
    );
  }

  const emailResult = await sendWaitlistWelcomeEmail({
    to: email,
    env,
  });

  if (!emailResult.ok) {
    console.error("[waitlist-test]", {
      request_id: requestId,
      stage: "email_send_failed",
      provider: emailResult.provider,
      email_sent: false,
      already_joined: false,
      error_code: emailResult.error_code ?? "send_failed",
      email_hash_prefix: "none",
    });
    return json({
      ok: true,
      request_id: requestId,
      email_sent: false,
      error_code: emailResult.error_code ?? "send_failed",
    });
  }

  console.info("[waitlist-test]", {
    request_id: requestId,
    stage: "email_send_succeeded",
    provider: emailResult.provider,
    email_sent: true,
    already_joined: false,
    email_hash_prefix: "none",
  });

  return json({
    ok: true,
    request_id: requestId,
    email_sent: true,
  });
};
