export const UNSUBSCRIBE_TTL_SECONDS: number;

export interface SignUnsubscribeTokenInput {
  secret: string;
  email: string;
  scope: "all" | "marketing";
  ts: number;
}

export interface VerifyUnsubscribeTokenInput {
  secret: string;
  email: string;
  scope: string;
  ts: string | number;
  sig: string;
  nowSeconds?: number;
  ttlSeconds?: number;
}

export type VerifyUnsubscribeTokenResult =
  | {
      ok: true;
      email: string;
      scope: "all" | "marketing";
      ts: number;
    }
  | {
      ok: false;
      reason: "invalid" | "expired";
    };

export interface BuildSignedUnsubscribeUrlInput {
  baseUrl: string;
  secret: string;
  email: string;
  scope?: "all" | "marketing";
  ts?: number;
}

export function signUnsubscribeToken(input: SignUnsubscribeTokenInput): string;
export function timingSafeHexEqual(expectedHex: string, providedHex: string): boolean;
export function verifyUnsubscribeToken(
  input: VerifyUnsubscribeTokenInput,
): VerifyUnsubscribeTokenResult;
export function buildSignedUnsubscribeUrl(
  input: BuildSignedUnsubscribeUrlInput,
): string;
