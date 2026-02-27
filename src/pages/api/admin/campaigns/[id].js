import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../lib/admin-auth.js";
import { cleanString, getSupabaseClient } from "../../../../lib/admin-api.js";

export const prerender = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = async (context) => {
  const env = getAdminRuntimeEnv(context);
  const authError = requireAdminAuth(context, env);
  if (authError) return authError;

  const supabase = getSupabaseClient(env);
  if (!supabase) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const campaignId = cleanString(context.params.id);
  if (!UUID_PATTERN.test(campaignId)) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  const { data, error } = await supabase.rpc("waitlist_admin_get_campaign", {
    p_campaign_id: campaignId,
  });

  if (error) {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return adminJson({ status: "error", code: "not_found" }, 404);
  }

  return adminJson(
    {
      status: "ok",
      campaign: row,
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
