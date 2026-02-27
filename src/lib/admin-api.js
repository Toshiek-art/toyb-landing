import { createClient } from "@supabase/supabase-js";

export const MAX_ADMIN_BODY_BYTES = 64 * 1024;

export const cleanString = (value) =>
  typeof value === "string" ? value.trim() : "";

export const parseBooleanQuery = (value) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
};

export const parseInteger = (value, fallback, min, max) => {
  const parsed = Number.parseInt(cleanString(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

export const parseBodyWithLimit = async (request, maxBytes = MAX_ADMIN_BODY_BYTES) => {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
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

export const parseJsonBody = async (request, maxBytes = MAX_ADMIN_BODY_BYTES) => {
  const contentType = cleanString(request.headers.get("content-type")).toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return { ok: false, code: "invalid_request", status: 415 };
  }

  const bodyText = await parseBodyWithLimit(request, maxBytes);
  if (bodyText === null || !bodyText) {
    return { ok: false, code: "invalid_request", status: 400 };
  }

  try {
    return { ok: true, data: JSON.parse(bodyText) };
  } catch {
    return { ok: false, code: "invalid_request", status: 400 };
  }
};

export const getSupabaseClient = (env) => {
  const supabaseUrl = cleanString(env.SUPABASE_URL);
  const supabaseAnonKey = cleanString(env.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value).toLowerCase());

export const parseEmailList = (value) => {
  if (!Array.isArray(value)) return [];

  const out = [];
  for (const item of value) {
    const email = cleanString(item).toLowerCase();
    if (!email || !isValidEmail(email)) continue;
    out.push(email);
  }

  return [...new Set(out)];
};
