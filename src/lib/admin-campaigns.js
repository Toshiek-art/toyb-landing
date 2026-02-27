import { sendCampaignEmail } from "./email";
import { buildSignedUnsubscribeUrl } from "./unsubscribe-token.js";
import {
  enforceCampaignSafetySegment,
  isCampaignRecipient,
  normalizeCampaignSegment,
  toWaitlistRpcParams,
} from "./admin-segment.js";

const WAITLIST_PAGE_LIMIT = 500;

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const markdownToHtml = (markdown) => {
  const normalized = cleanString(markdown);
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n\s*\n/g)
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("\n");
};

export const buildCampaignEmailContent = ({
  bodyMarkdown,
  unsubscribeUrl,
}) => {
  const bodyText = cleanString(bodyMarkdown);
  const unsubscribeLine = `Unsubscribe from marketing updates: ${unsubscribeUrl}`;

  return {
    text: `${bodyText}\n\n${unsubscribeLine}`.trim(),
    html: `${markdownToHtml(bodyText)}\n<p><a href="${unsubscribeUrl}">Unsubscribe from marketing updates</a></p>`,
  };
};

export const normalizeSafeCampaignSegment = (segmentInput) => {
  const normalized = normalizeCampaignSegment(segmentInput ?? {}, {
    defaultMarketingOnly: true,
    defaultSubscribedOnly: true,
  });

  return enforceCampaignSafetySegment(normalized);
};

const listWaitlistPage = async ({ supabase, segment, limit, offset }) => {
  const { data, error } = await supabase.rpc(
    "waitlist_admin_list",
    toWaitlistRpcParams({
      segment,
      limit,
      offset,
      marketing: segment.marketing_only ? true : null,
      subscribedOnly: true,
    }),
  );

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

export const previewCampaignRecipients = async ({ supabase, segmentInput }) => {
  const segment = normalizeSafeCampaignSegment(segmentInput);
  const rows = await listWaitlistPage({
    supabase,
    segment,
    limit: 10,
    offset: 0,
  });

  const sampleEmails = [];
  for (const row of rows) {
    if (!isCampaignRecipient(row, segment)) continue;
    const email = cleanString(row.email).toLowerCase();
    if (!email) continue;
    sampleEmails.push(email);
    if (sampleEmails.length >= 10) break;
  }

  const recipientCountRaw = rows[0]?.total_count;
  const recipientCount =
    typeof recipientCountRaw === "number"
      ? recipientCountRaw
      : Number.parseInt(String(recipientCountRaw ?? "0"), 10) || 0;

  return {
    segment,
    recipient_count: recipientCount,
    sample_emails: sampleEmails,
  };
};

export const collectCampaignRecipients = async ({ supabase, segmentInput }) => {
  const segment = normalizeSafeCampaignSegment(segmentInput);
  const recipients = new Set();
  let offset = 0;

  while (true) {
    const rows = await listWaitlistPage({
      supabase,
      segment,
      limit: WAITLIST_PAGE_LIMIT,
      offset,
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      if (!isCampaignRecipient(row, segment)) continue;
      const email = cleanString(row.email).toLowerCase();
      if (!email) continue;
      recipients.add(email);
    }

    if (rows.length < WAITLIST_PAGE_LIMIT) break;
    offset += WAITLIST_PAGE_LIMIT;
  }

  return {
    segment,
    emails: [...recipients],
  };
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const sendCampaignBatch = async ({
  emails,
  subject,
  bodyMarkdown,
  env,
  onResult,
}) => {
  const unsubscribeSecret = cleanString(env.WAITLIST_UNSUBSCRIBE_SECRET);
  const unsubscribeBaseUrl = cleanString(env.WAITLIST_UNSUBSCRIBE_BASE_URL);

  let sent = 0;
  let failed = 0;

  for (const batch of chunkArray(emails, 50)) {
    for (const email of batch) {
      let result = { ok: false, error_code: "misconfigured_email" };

      if (unsubscribeSecret && unsubscribeBaseUrl) {
        try {
          const unsubscribeUrl = buildSignedUnsubscribeUrl({
            baseUrl: unsubscribeBaseUrl,
            secret: unsubscribeSecret,
            email,
            scope: "marketing",
          });
          const content = buildCampaignEmailContent({
            bodyMarkdown,
            unsubscribeUrl,
          });

          result = await sendCampaignEmail({
            to: email,
            subject,
            text: content.text,
            html: content.html,
            env,
          });
        } catch {
          result = { ok: false, error_code: "misconfigured_email" };
        }
      }

      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
      }

      await onResult({
        email,
        ok: result.ok,
        error_code: result.error_code,
      });
    }
  }

  return {
    sent,
    failed,
  };
};
