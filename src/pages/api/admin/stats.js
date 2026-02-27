import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../lib/admin-auth.js";
import { getSupabaseClient } from "../../../lib/admin-api.js";

export const prerender = false;

export const GET = async (context) => {
  const env = getAdminRuntimeEnv(context);
  const authError = requireAdminAuth(context, env);
  if (authError) return authError;

  const supabase = getSupabaseClient(env);
  if (!supabase) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const { data, error } = await supabase.rpc("waitlist_admin_stats");
  if (error) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const row = Array.isArray(data) ? data[0] ?? {} : {};

  return adminJson(
    {
      status: "ok",
      total: Number(row.total ?? 0),
      marketing_opt_in: Number(row.marketing_opt_in ?? 0),
      unsubscribed: Number(row.unsubscribed ?? 0),
      last_7_days: Number(row.last_7_days ?? 0),
      beta_invited: Number(row.beta_invited ?? 0),
      beta_active: Number(row.beta_active ?? 0),
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
