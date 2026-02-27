import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../lib/admin-auth.js";
import {
  cleanString,
  getSupabaseClient,
  isValidEmail,
  parseJsonBody,
} from "../../../../lib/admin-api.js";

export const prerender = false;

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
  const email = cleanString(body.email).toLowerCase();
  const active = body.active;

  if (!isValidEmail(email) || typeof active !== "boolean") {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  const { error } = await supabase.rpc("waitlist_admin_set_beta_active", {
    p_email: email,
    p_active: active,
  });

  if (error) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  return adminJson({ status: "ok" }, 200);
};

export const ALL = async () =>
  adminJson(
    {
      status: "error",
      code: "invalid_request",
    },
    405,
  );
