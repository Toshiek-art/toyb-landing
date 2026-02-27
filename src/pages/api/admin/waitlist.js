import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../lib/admin-auth.js";
import {
  cleanString,
  getSupabaseClient,
  parseBooleanQuery,
  parseInteger,
} from "../../../lib/admin-api.js";
import { DATE_PATTERN } from "../../../lib/admin-segment.js";

export const prerender = false;

const parseNullableDate = (value) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  return DATE_PATTERN.test(normalized) ? normalized : null;
};

const parseBetaFilter = (value) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "invited") return "invited";
  if (normalized === "active") return "active";
  if (normalized === "none") return "none";
  return null;
};

export const GET = async (context) => {
  const env = getAdminRuntimeEnv(context);
  const authError = requireAdminAuth(context, env);
  if (authError) return authError;

  const supabase = getSupabaseClient(env);
  if (!supabase) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const url = new URL(context.request.url);
  const marketing = parseBooleanQuery(url.searchParams.get("marketing"));
  const subscribedOnly =
    parseBooleanQuery(url.searchParams.get("subscribed_only")) ?? false;
  const source = cleanString(url.searchParams.get("source")) || null;
  const beta = parseBetaFilter(url.searchParams.get("beta"));
  const from = parseNullableDate(url.searchParams.get("from"));
  const to = parseNullableDate(url.searchParams.get("to"));
  const limit = parseInteger(url.searchParams.get("limit"), 50, 1, 500);
  const offset = parseInteger(url.searchParams.get("offset"), 0, 0, 1000000);

  const { data, error } = await supabase.rpc("waitlist_admin_list", {
    p_marketing: marketing,
    p_source: source,
    p_subscribed_only: subscribedOnly,
    p_beta: beta,
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  const rows = Array.isArray(data) ? data : [];
  const totalCountRaw = rows[0]?.total_count;
  const totalCount =
    typeof totalCountRaw === "number"
      ? totalCountRaw
      : Number.parseInt(String(totalCountRaw ?? "0"), 10) || 0;

  return adminJson(
    {
      status: "ok",
      total_count: totalCount,
      limit,
      offset,
      rows: rows.map((row) => ({
        email: row.email,
        created_at: row.created_at,
        source: row.source,
        marketing_consent: row.marketing_consent,
        unsubscribed_at: row.unsubscribed_at,
        beta_invited_at: row.beta_invited_at,
        beta_active: row.beta_active,
      })),
    },
    200,
  );
};

export const ALL = async () =>
  adminJson(
    {
      status: "error",
      code: "invalid_request",
    },
    405,
  );
