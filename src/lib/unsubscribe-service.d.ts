export interface UnsubscribeQuery {
  email?: string;
  scope?: string;
  ts?: string;
  sig?: string;
}

export interface UnsubscribeRequestMeta {
  ip?: string;
}

export interface UnsubscribeServiceEnv {
  WAITLIST_UNSUBSCRIBE_SECRET?: string;
  WAITLIST_IP_SALT?: string;
}

export interface UnsubscribeServiceDeps {
  applyUnsubscribe: (input: {
    email: string;
    scope: "all" | "marketing";
  }) => Promise<void>;
  invalidAttemptStore?: Map<string, { count: number; resetAt: number }>;
}

export interface UnsubscribeServiceResult {
  status: number;
  body:
    | { status: "ok" }
    | {
        status: "error";
        error: "invalid_signature" | "expired" | "server_error";
      };
}

export function handleUnsubscribeRequest(input: {
  query: UnsubscribeQuery;
  requestMeta: UnsubscribeRequestMeta;
  env: UnsubscribeServiceEnv;
  deps: UnsubscribeServiceDeps;
}): Promise<UnsubscribeServiceResult>;
