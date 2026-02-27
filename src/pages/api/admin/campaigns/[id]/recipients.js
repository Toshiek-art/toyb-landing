import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../../lib/admin-auth.js";
import { cleanString, getSupabaseClient, parseInteger } from "../../../../../lib/admin-api.js";

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

  const url = new URL(context.request.url);
  const limit = parseInteger(url.searchParams.get("limit"), 100, 1, 500);
  const offset = parseInteger(url.searchParams.get("offset"), 0, 0, 1000000);

  const { data, error } = await supabase.rpc(
    "waitlist_admin_list_campaign_recipients",
    {
      p_campaign_id: campaignId,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) {
    return adminJson({ status: "error", code: "server_error" }, 500);
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
      rows,
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
