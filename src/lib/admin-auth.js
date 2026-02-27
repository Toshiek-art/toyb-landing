import { timingSafeEqual } from "node:crypto";

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const parseBearerToken = (authorizationHeader) => {
  const normalized = cleanString(authorizationHeader);
  if (!normalized.toLowerCase().startsWith("bearer ")) return "";
  return normalized.slice(7).trim();
};

// Security decision: timing-safe token comparison avoids oracle leaks.
const timingSafeStringEqual = (left, right) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const isSameOrigin = (request) => {
  const origin = cleanString(request.headers.get("origin"));
  if (!origin) return true;

  try {
    const requestOrigin = new URL(request.url).origin;
    return new URL(origin).origin === requestOrigin;
  } catch {
    return false;
  }
};

export const getAdminRuntimeEnv = (context) => {
  const runtime = context.locals?.runtime?.env;
  const staticEnv = import.meta.env;
  return {
    ...staticEnv,
    ...runtime,
  };
};

export const requireAdminAuth = (context, env) => {
  if (!isSameOrigin(context.request)) {
    return json({ status: "error", code: "forbidden_origin" }, 403);
  }

  const expected = cleanString(env.WAITLIST_ADMIN_TOKEN);
  if (!expected) {
    return json({ status: "error", code: "server_error" }, 500);
  }

  const provided = parseBearerToken(
    cleanString(context.request.headers.get("authorization")),
  );

  if (!provided) {
    return json({ status: "error", code: "unauthorized" }, 401);
  }

  if (!timingSafeStringEqual(expected, provided)) {
    return json({ status: "error", code: "forbidden" }, 403);
  }

  return null;
};

export const adminJson = json;
