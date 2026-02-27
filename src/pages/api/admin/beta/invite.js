import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../lib/admin-auth.js";
import {
  cleanString,
  getSupabaseClient,
  parseBooleanQuery,
  parseEmailList,
  parseJsonBody,
} from "../../../../lib/admin-api.js";
import { DATE_PATTERN } from "../../../../lib/admin-segment.js";

export const prerender = false;

const parseBetaFilter = (value) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "invited") return "invited";
  if (normalized === "active") return "active";
  if (normalized === "none") return "none";
  return null;
};

const parseNullableDate = (value) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  return DATE_PATTERN.test(normalized) ? normalized : null;
};

export const POST = async (context) => {
  const env = getAdminRuntimeEnv(context);
  const authError = requireAdminAuth(context, env);
  if (authError) return authError;

  const supabase = getSupabaseClient(env);
  if (!supabase) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const parsed = await parseJsonBody(context.request);
  if (!parsed.ok) {
    return adminJson({ status: "error", code: parsed.code }, parsed.status);
  }

  const body = parsed.data ?? {};
  const emails = parseEmailList(body.emails);

  if (emails.length > 0) {
    const { data, error } = await supabase.rpc("waitlist_admin_invite_beta_emails", {
      p_emails: emails,
    });

    if (error) {
      return adminJson({ status: "error", code: "server_error" }, 500);
    }

    const row = Array.isArray(data) ? data[0] : null;
    return adminJson(
      {
        status: "ok",
        updated_count: Number(row?.updated_count ?? 0),
      },
      200,
    );
  }

  const filter = body.filter;
  if (typeof filter !== "object" || filter === null) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  const marketing =
    parseBooleanQuery(filter.marketing) ??
    parseBooleanQuery(filter.marketing_only);
  const source = cleanString(filter.source) || null;
  const subscribedOnly = parseBooleanQuery(filter.subscribed_only) ?? false;
  const beta = parseBetaFilter(filter.beta);
  const from = parseNullableDate(filter.from);
  const to = parseNullableDate(filter.to);

  const { data, error } = await supabase.rpc("waitlist_admin_invite_beta_segment", {
    p_marketing: marketing,
    p_source: source,
    p_subscribed_only: subscribedOnly,
    p_beta: beta,
    p_from: from,
    p_to: to,
  });

  if (error) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  const row = Array.isArray(data) ? data[0] : null;

  return adminJson(
    {
      status: "ok",
      updated_count: Number(row?.updated_count ?? 0),
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
