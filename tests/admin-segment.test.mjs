import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceCampaignSafetySegment,
  isCampaignRecipient,
  normalizeCampaignSegment,
} from "../src/lib/admin-segment.js";

test("campaign segment defaults and safety enforcement", () => {
  const segment = normalizeCampaignSegment({}, {
    defaultMarketingOnly: true,
    defaultSubscribedOnly: true,
  });

  assert.equal(segment.marketing_only, true);
  assert.equal(segment.subscribed_only, true);

  const safe = enforceCampaignSafetySegment({
    ...segment,
    marketing_only: false,
    subscribed_only: false,
  });

  assert.equal(safe.marketing_only, true);
  assert.equal(safe.subscribed_only, true);
});

test("campaign recipient selection excludes unsubscribed and applies beta filters", () => {
  const base = {
    marketing_consent: true,
    unsubscribed_at: null,
    beta_invited_at: null,
    beta_active: false,
  };

  const defaultSegment = {
    marketing_only: true,
    subscribed_only: true,
    source: null,
    beta: null,
    from: null,
    to: null,
  };

  assert.equal(isCampaignRecipient(base, defaultSegment), true);
  assert.equal(
    isCampaignRecipient({ ...base, unsubscribed_at: "2026-02-20T10:00:00Z" }, defaultSegment),
    false,
  );
  assert.equal(
    isCampaignRecipient({ ...base, marketing_consent: false }, defaultSegment),
    false,
  );
  assert.equal(
    isCampaignRecipient({ ...base, beta_invited_at: null }, { ...defaultSegment, beta: "invited" }),
    false,
  );
  assert.equal(
    isCampaignRecipient(
      { ...base, beta_invited_at: "2026-02-20T10:00:00Z" },
      { ...defaultSegment, beta: "invited" },
    ),
    true,
  );
  assert.equal(
    isCampaignRecipient({ ...base, beta_active: false }, { ...defaultSegment, beta: "active" }),
    false,
  );
  assert.equal(
    isCampaignRecipient({ ...base, beta_active: true }, { ...defaultSegment, beta: "active" }),
    true,
  );
});
