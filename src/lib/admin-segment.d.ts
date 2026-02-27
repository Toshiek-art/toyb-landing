export type AdminCampaignBetaFilter = "invited" | "active" | null;

export interface AdminCampaignSegment {
  marketing_only: boolean;
  subscribed_only: boolean;
  source: string | null;
  beta: AdminCampaignBetaFilter;
  from: string | null;
  to: string | null;
}

export function normalizeCampaignSegment(
  input: {
    marketing_only?: unknown;
    subscribed_only?: unknown;
    source?: unknown;
    beta?: unknown;
    from?: unknown;
    to?: unknown;
  },
  options?: { defaultMarketingOnly: boolean; defaultSubscribedOnly: boolean },
): AdminCampaignSegment;

export function enforceCampaignSafetySegment(
  segment: AdminCampaignSegment,
): AdminCampaignSegment;

export function isCampaignRecipient(
  row: {
    marketing_consent: boolean;
    unsubscribed_at: string | null;
    beta_invited_at: string | null;
    beta_active: boolean;
  },
  segment: AdminCampaignSegment,
): boolean;

export function toWaitlistRpcParams(input: {
  segment: AdminCampaignSegment;
  limit: number;
  offset: number;
  marketing?: boolean | null;
  subscribedOnly?: boolean;
}): {
  p_marketing: boolean | null;
  p_source: string | null;
  p_subscribed_only: boolean;
  p_beta: AdminCampaignBetaFilter;
  p_from: string | null;
  p_to: string | null;
  p_limit: number;
  p_offset: number;
};
