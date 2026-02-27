export interface WaitlistEmailEnv {
  RESEND_API_KEY?: string;
  WAITLIST_FROM?: string;
  EMAIL_PROVIDER?: string;
}

export type EmailProvider = "resend" | "mock";
export type EmailErrorCode = "misconfigured_email" | "resend_error";

export interface EmailSendResult {
  ok: boolean;
  provider: EmailProvider;
  error_code?: EmailErrorCode;
  provider_status?: number;
}

export interface SendWaitlistEmailInput {
  to: string;
  marketingConsent: boolean;
  unsubscribeUrl: string;
  env: WaitlistEmailEnv;
}

export interface SendCampaignEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  env: WaitlistEmailEnv;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const extractFromEmail = (value: string): string => {
  const match = value.match(/<([^<>]+)>/);
  return cleanString(match?.[1] ?? value).toLowerCase();
};

const isValidFromAddress = (value: string): boolean => {
  const email = extractFromEmail(value);
  if (!EMAIL_PATTERN.test(email)) return false;

  const domain = email.split("@")[1] ?? "";
  return (
    domain.length > 0 &&
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".")
  );
};

const isProductionRuntime = (): boolean => {
  const nodeEnv = (
    globalThis as { process?: { env?: { NODE_ENV?: string } } }
  ).process?.env?.NODE_ENV;
  return nodeEnv === "production";
};

export const getEmailProvider = (env: WaitlistEmailEnv): EmailProvider => {
  const provider = cleanString(env.EMAIL_PROVIDER).toLowerCase();
  if (provider === "mock") return "mock";
  if (provider === "resend") return "resend";
  if (cleanString(env.RESEND_API_KEY)) return "resend";
  return isProductionRuntime() ? "resend" : "mock";
};

const getEmailBody = (
  marketingConsent: boolean,
  unsubscribeUrl: string,
): { subject: string; text: string; html: string } => {
  if (marketingConsent) {
    return {
      subject: "Welcome to Toyb (marketing enabled)",
      text: [
        "You're on the waitlist.",
        "You also opted in for marketing updates.",
        "",
        `Unsubscribe from marketing: ${unsubscribeUrl}`,
      ].join("\n"),
      html: [
        "<p>You're on the waitlist.</p>",
        "<p>You also opted in for marketing updates.</p>",
        `<p><a href="${unsubscribeUrl}">Unsubscribe from marketing</a></p>`,
      ].join(""),
    };
  }

  return {
    subject: "Welcome to Toyb",
    text: [
      "You're on the waitlist.",
      "You did not opt in for marketing updates.",
      "",
      `Manage marketing preference: ${unsubscribeUrl}`,
    ].join("\n"),
    html: [
      "<p>You're on the waitlist.</p>",
      "<p>You did not opt in for marketing updates.</p>",
      `<p><a href="${unsubscribeUrl}">Manage marketing preference</a></p>`,
    ].join(""),
  };
};

export async function sendWaitlistEmail(
  input: SendWaitlistEmailInput,
): Promise<EmailSendResult> {
  const body = getEmailBody(input.marketingConsent, input.unsubscribeUrl);
  return sendEmailMessage({
    to: input.to,
    subject: body.subject,
    text: body.text,
    html: body.html,
    env: input.env,
  });
}

export async function sendCampaignEmail(
  input: SendCampaignEmailInput,
): Promise<EmailSendResult> {
  return sendEmailMessage({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    env: input.env,
  });
}

async function sendEmailMessage({
  to,
  subject,
  text,
  html,
  env,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  env: WaitlistEmailEnv;
}): Promise<EmailSendResult> {
  const provider = getEmailProvider(env);
  if (provider === "mock") {
    return { ok: true, provider: "mock" };
  }

  const apiKey = cleanString(env.RESEND_API_KEY);
  const from = cleanString(env.WAITLIST_FROM);

  if (!apiKey || !isValidFromAddress(from)) {
    return {
      ok: false,
      provider: "resend",
      error_code: "misconfigured_email",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: "resend",
        error_code: "resend_error",
        provider_status: response.status,
      };
    }

    return { ok: true, provider: "resend" };
  } catch {
    return {
      ok: false,
      provider: "resend",
      error_code: "resend_error",
    };
  }
}
