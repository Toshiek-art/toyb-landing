export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const parseBoolean = (value) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

const parseNullableDate = (value) => {
  const normalized = cleanString(value);
  if (!normalized) return null;
  return DATE_PATTERN.test(normalized) ? normalized : null;
};

const parseBeta = (value) => {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "invited") return "invited";
  if (normalized === "active") return "active";
  return null;
};

export const normalizeCampaignSegment = (
  input,
  options = {
    defaultMarketingOnly: true,
    defaultSubscribedOnly: true,
  },
) => {
  const marketingOnly = parseBoolean(input?.marketing_only);
  const subscribedOnly = parseBoolean(input?.subscribed_only);

  return {
    marketing_only:
      marketingOnly === null ? options.defaultMarketingOnly : marketingOnly,
    subscribed_only:
      subscribedOnly === null ? options.defaultSubscribedOnly : subscribedOnly,
    source: cleanString(input?.source) || null,
    beta: parseBeta(input?.beta),
    from: parseNullableDate(input?.from),
    to: parseNullableDate(input?.to),
  };
};

// Security decision: campaigns always enforce marketing + subscribed-only.
export const enforceCampaignSafetySegment = (segment) => ({
  ...segment,
  marketing_only: true,
  subscribed_only: true,
});

export const isCampaignRecipient = (row, segment) => {
  if (row.unsubscribed_at !== null) return false;

  if (segment.marketing_only && row.marketing_consent !== true) {
    return false;
  }

  if (segment.beta === "invited" && row.beta_invited_at === null) {
    return false;
  }

  if (segment.beta === "active" && row.beta_active !== true) {
    return false;
  }

  return true;
};

export const toWaitlistRpcParams = ({
  segment,
  limit,
  offset,
  marketing,
  subscribedOnly,
}) => ({
  p_marketing: typeof marketing === "boolean" ? marketing : null,
  p_source: segment.source,
  p_subscribed_only:
    typeof subscribedOnly === "boolean"
      ? subscribedOnly
      : Boolean(segment.subscribed_only),
  p_beta: segment.beta,
  p_from: segment.from,
  p_to: segment.to,
  p_limit: limit,
  p_offset: offset,
});
