const cleanString = (value) => (typeof value === "string" ? value.trim() : "");

const isPostgrestFunctionResolutionError = (error, functionName) => {
  const code = cleanString(error?.code);
  const message = `${cleanString(error?.message)} ${cleanString(error?.details)} ${cleanString(
    error?.hint,
  )}`.toLowerCase();
  const fnName = functionName.toLowerCase();

  if (code === "PGRST202" || code === "42883") {
    return true;
  }

  return (
    message.includes(fnName) &&
    (message.includes("could not find") ||
      message.includes("does not exist") ||
      message.includes("no function matches") ||
      message.includes("function not found"))
  );
};

const firstRow = (data) => {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  if (data && typeof data === "object") {
    return data;
  }

  return null;
};

const normalizeCurrentResult = (data) => {
  const row = firstRow(data);

  return {
    inserted: row?.inserted === true,
    updated: row?.updated === true,
  };
};

const normalizeLegacyResult = (data) => {
  const row = firstRow(data);
  if (!row) {
    return { inserted: false, updated: false };
  }

  const alreadyJoined = row.already_joined === true;
  const recordedMarketingConsent = row.recorded_marketing_consent === true;

  return {
    inserted: !alreadyJoined,
    updated: alreadyJoined ? recordedMarketingConsent : false,
  };
};

const callRpc = async (supabase, fn, params) => {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    throw error;
  }

  return data;
};

export const buildWaitlistCurrentRpcParams = (input) => ({
  p_email: input.email,
  p_source: input.source,
  p_user_agent: input.userAgent,
  p_ip_hash: input.ipHash,
  p_age_confirmed: true,
  p_privacy_accepted: true,
  p_marketing_consent: input.marketingConsent,
  p_privacy_version: input.privacyVersion,
});

export const buildWaitlistConsentRpcParams = (input) => ({
  p_email: input.email,
  p_source: input.source,
  p_user_agent: input.userAgent,
  p_ip_hash: input.ipHash,
  p_consent_age_16: true,
  p_consent_marketing: input.marketingConsent,
  p_consent_source: input.source,
  p_consent_version: input.privacyVersion,
});

export const buildWaitlistMinimalRpcParams = (input) => ({
  p_email: input.email,
  p_source: input.source,
  p_user_agent: input.userAgent,
  p_ip_hash: input.ipHash,
});

export async function upsertWaitlistWithCompatibility({ supabase, input }) {
  const attempts = [
    {
      fn: "waitlist_upsert",
      params: buildWaitlistCurrentRpcParams(input),
      normalize: normalizeCurrentResult,
    },
    {
      fn: "insert_waitlist",
      params: buildWaitlistCurrentRpcParams(input),
      normalize: normalizeLegacyResult,
    },
    {
      fn: "insert_waitlist",
      params: buildWaitlistConsentRpcParams(input),
      normalize: normalizeLegacyResult,
    },
    {
      fn: "insert_waitlist",
      params: buildWaitlistMinimalRpcParams(input),
      normalize: normalizeLegacyResult,
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const data = await callRpc(supabase, attempt.fn, attempt.params);
      return attempt.normalize(data);
    } catch (error) {
      lastError = error;
      if (!isPostgrestFunctionResolutionError(error, attempt.fn)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("waitlist_upsert_unavailable");
}
