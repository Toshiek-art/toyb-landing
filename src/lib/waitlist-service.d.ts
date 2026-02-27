export interface WaitlistPayload {
  email?: unknown;
  source?: unknown;
  company?: unknown;
  age_confirmed?: unknown;
  privacy_accepted?: unknown;
  marketing_consent?: unknown;
  privacy_version?: unknown;
}

export interface WaitlistRequestMeta {
  origin?: string;
  ip?: string;
  userAgent?: string | null;
  requestUrl?: string;
}

export interface WaitlistServiceEnv {
  WAITLIST_ALLOWED_ORIGINS?: string;
  WAITLIST_IP_SALT?: string;
  WAITLIST_UNSUBSCRIBE_SECRET?: string;
  WAITLIST_UNSUBSCRIBE_BASE_URL?: string;
}

export interface WaitlistUpsertInput {
  email: string;
  source: string;
  userAgent: string | null;
  ipHash: string;
  marketingConsent: boolean;
  privacyVersion: string;
}

export interface WaitlistServiceDeps {
  upsertWaitlist: (
    input: WaitlistUpsertInput,
  ) => Promise<{ inserted: boolean; updated: boolean }>;
  sendEmail: (input: {
    to: string;
    marketingConsent: boolean;
    unsubscribeUrl: string;
  }) => Promise<{ ok: boolean; error_code?: string }>;
  rateLimitStore?: Map<string, { count: number; resetAt: number }>;
}

export interface WaitlistServiceResult {
  status: number;
  body: Record<string, unknown>;
  origin: string | null;
}

export function handleWaitlistSubmission(input: {
  payload: WaitlistPayload;
  requestMeta: WaitlistRequestMeta;
  env: WaitlistServiceEnv;
  deps: WaitlistServiceDeps;
}): Promise<WaitlistServiceResult>;
