import { adminJson, getAdminRuntimeEnv, requireAdminAuth } from "../../../../lib/admin-auth.js";
import { cleanString, getSupabaseClient, parseJsonBody } from "../../../../lib/admin-api.js";
import {
  collectCampaignRecipients,
  normalizeSafeCampaignSegment,
  sendCampaignBatch,
} from "../../../../lib/admin-campaigns.js";
import { trackServerEvent } from "../../../../lib/server-analytics.js";

export const prerender = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RECIPIENT_PAGE_LIMIT = 500;

const listCampaignRecipientEmails = async (supabase, campaignId) => {
  const emails = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.rpc(
      "waitlist_admin_list_campaign_recipients",
      {
        p_campaign_id: campaignId,
        p_limit: RECIPIENT_PAGE_LIMIT,
        p_offset: offset,
      },
    );

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (cleanString(row.status).toLowerCase() === "sent") {
        continue;
      }
      const email = cleanString(row.email).toLowerCase();
      if (!email) continue;
      emails.add(email);
    }

    if (rows.length < RECIPIENT_PAGE_LIMIT) break;
    offset += RECIPIENT_PAGE_LIMIT;
  }

  return [...emails];
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

  const payload = parsed.data ?? {};
  const requestedCampaignId = cleanString(payload.campaign_id);
  const hasExistingCampaign = requestedCampaignId.length > 0;

  if (hasExistingCampaign && !UUID_PATTERN.test(requestedCampaignId)) {
    return adminJson({ status: "error", code: "invalid_request" }, 400);
  }

  let campaignId = requestedCampaignId;
  let subject = cleanString(payload.subject);
  let bodyMarkdown = cleanString(payload.body_markdown);
  let safeSegment = normalizeSafeCampaignSegment(payload.segment ?? {});
  let recipientEmails = [];
  let didBeginSend = false;

  try {
    if (!hasExistingCampaign) {
      if (!subject || !bodyMarkdown) {
        return adminJson({ status: "error", code: "invalid_request" }, 400);
      }

      const recipients = await collectCampaignRecipients({
        supabase,
        segmentInput: safeSegment,
      });

      const { data: campaignRows, error: campaignError } = await supabase.rpc(
        "waitlist_admin_create_campaign",
        {
          p_subject: subject,
          p_body_markdown: bodyMarkdown,
          p_segment: safeSegment,
        },
      );

      if (campaignError) {
        return adminJson({ status: "error", code: "server_error" }, 500);
      }

      campaignId = Array.isArray(campaignRows)
        ? campaignRows[0]?.campaign_id
        : "";

      if (!UUID_PATTERN.test(campaignId)) {
        return adminJson({ status: "error", code: "server_error" }, 500);
      }

      const { error: recipientsInsertError } = await supabase.rpc(
        "waitlist_admin_campaign_add_recipients",
        {
          p_campaign_id: campaignId,
          p_emails: recipients.emails,
        },
      );

      if (recipientsInsertError) {
        return adminJson({ status: "error", code: "server_error" }, 500);
      }

      recipientEmails = recipients.emails;
    }

    const { data: beginRows, error: beginError } = await supabase.rpc(
      "waitlist_admin_campaign_begin_send",
      {
        p_campaign_id: campaignId,
      },
    );

    if (beginError) {
      return adminJson({ status: "error", code: "server_error" }, 500);
    }

    const begin = Array.isArray(beginRows) ? beginRows[0] : null;
    if (!begin) {
      return adminJson({ status: "error", code: "server_error" }, 500);
    }

    if (begin.can_send !== true) {
      return adminJson(
        {
          status: "ok",
          campaign_id: campaignId,
          campaign_status: cleanString(begin.campaign_status) || "unknown",
          already_processed: true,
          recipient_count: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
        },
        200,
      );
    }
    didBeginSend = true;

    subject = cleanString(begin.subject) || subject;
    bodyMarkdown = cleanString(begin.body_markdown) || bodyMarkdown;
    safeSegment = normalizeSafeCampaignSegment(begin.segment ?? safeSegment);

    if (!subject || !bodyMarkdown) {
      return adminJson({ status: "error", code: "server_error" }, 500);
    }

    if (hasExistingCampaign) {
      recipientEmails = await listCampaignRecipientEmails(supabase, campaignId);

      if (recipientEmails.length === 0) {
        const fallbackRecipients = await collectCampaignRecipients({
          supabase,
          segmentInput: safeSegment,
        });

        recipientEmails = fallbackRecipients.emails;

        const { error: recipientsInsertError } = await supabase.rpc(
          "waitlist_admin_campaign_add_recipients",
          {
            p_campaign_id: campaignId,
            p_emails: recipientEmails,
          },
        );

        if (recipientsInsertError) {
          return adminJson({ status: "error", code: "server_error" }, 500);
        }
      }
    }

    const totals = await sendCampaignBatch({
      emails: recipientEmails,
      subject,
      bodyMarkdown,
      env,
      onResult: async ({ email, ok, error_code }) => {
        await supabase.rpc("waitlist_admin_campaign_set_recipient_result", {
          p_campaign_id: campaignId,
          p_email: email,
          p_status: ok ? "sent" : "failed",
          p_error_code: ok ? null : error_code ?? "send_failed",
        });
      },
    });

    await supabase.rpc("waitlist_admin_campaign_finish_send", {
      p_campaign_id: campaignId,
      p_recipient_count: recipientEmails.length,
    });

    trackServerEvent("admin_campaign_send", {
      campaign_id: campaignId,
      recipient_count: recipientEmails.length,
      sent: totals.sent,
      failed: totals.failed,
    });

    return adminJson(
      {
        status: "ok",
        campaign_id: campaignId,
        campaign_status: "sent",
        recipient_count: recipientEmails.length,
        sent: totals.sent,
        failed: totals.failed,
        skipped: Math.max(recipientEmails.length - totals.sent - totals.failed, 0),
      },
      200,
    );
  } catch {
    if (didBeginSend && UUID_PATTERN.test(campaignId)) {
      try {
        await supabase.rpc("waitlist_admin_campaign_mark_failed", {
          p_campaign_id: campaignId,
        });
      } catch {
        // Ignore fallback errors to preserve the original failure response.
      }
    }
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
