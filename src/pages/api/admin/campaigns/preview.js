import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../lib/admin-auth.js";
import { getSupabaseClient, parseJsonBody } from "../../../../lib/admin-api.js";
import { previewCampaignRecipients } from "../../../../lib/admin-campaigns.js";
import { trackServerEvent } from "../../../../lib/server-analytics.js";

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

  const segmentInput = parsed.data?.segment ?? {};

  try {
    const preview = await previewCampaignRecipients({
      supabase,
      segmentInput,
    });

    trackServerEvent("admin_campaign_preview", {
      recipient_count: preview.recipient_count,
      beta: preview.segment.beta,
      source: preview.segment.source ?? "all",
    });

    return adminJson(
      {
        status: "ok",
        recipient_count: preview.recipient_count,
        sample_emails: preview.sample_emails,
      },
      200,
    );
  } catch {
    return adminJson({ status: "error", code: "server_error" }, 500);
  }
};

export const ALL = async () =>
  adminJson(
    {
      status: "error",
      code: "invalid_request",
    },
    405,
  );
