export interface WaitlistEmailEnv {
  RESEND_API_KEY?: string;
  WAITLIST_FROM?: string;
  WAITLIST_EMAIL_PROVIDER?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_SECURE?: string;
}

export type EmailProvider = "resend" | "smtp";
export type EmailErrorCode =
  | "misconfigured_email"
  | "provider_http_error"
  | "provider_network_error"
  | "smtp_unavailable"
  | "smtp_send_failed";

export interface EmailSendResult {
  ok: boolean;
  provider: EmailProvider;
  error_code?: EmailErrorCode;
  provider_status?: number;
}

interface SendWelcomeEmailInput {
  to: string;
  env: WaitlistEmailEnv;
}

const SUBJECT = "Welcome to the Trybe.";
const TEXT_BODY = `You're early. That matters.
We'll write soon.
— Toyb`;
const HTML_BODY = `<p>You're early. That matters.<br/>We'll write soon.<br/>— Toyb</p>`;
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

export const getWaitlistEmailProvider = (
  env: Pick<WaitlistEmailEnv, "WAITLIST_EMAIL_PROVIDER">,
): EmailProvider =>
  cleanString(env.WAITLIST_EMAIL_PROVIDER).toLowerCase() === "smtp"
    ? "smtp"
    : "resend";

export async function sendWaitlistWelcomeEmail(
  input: SendWelcomeEmailInput,
): Promise<EmailSendResult> {
  if (getWaitlistEmailProvider(input.env) === "smtp") {
    return sendViaSmtp(input);
  }

  return sendViaResend(input);
}

async function sendViaResend({
  to,
  env,
}: SendWelcomeEmailInput): Promise<EmailSendResult> {
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
        subject: SUBJECT,
        text: TEXT_BODY,
        html: HTML_BODY,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: "resend",
        error_code: "provider_http_error",
        provider_status: response.status,
      };
    }

    return { ok: true, provider: "resend" };
  } catch {
    return {
      ok: false,
      provider: "resend",
      error_code: "provider_network_error",
    };
  }
}

async function sendViaSmtp({
  to,
  env,
}: SendWelcomeEmailInput): Promise<EmailSendResult> {
  const isNodeRuntime =
    typeof (globalThis as { process?: { versions?: { node?: string } } })
      .process?.versions?.node === "string";
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;

  if (!isNodeRuntime) {
    return {
      ok: false,
      provider: "smtp",
      error_code: "smtp_unavailable",
    };
  }

  if (nodeEnv !== "development") {
    return {
      ok: false,
      provider: "smtp",
      error_code: "smtp_unavailable",
    };
  }

  const host = cleanString(env.SMTP_HOST);
  const port = Number(env.SMTP_PORT ?? "587");
  const user = cleanString(env.SMTP_USER);
  const pass = cleanString(env.SMTP_PASS);
  const from = cleanString(env.WAITLIST_FROM);
  if (!host || !port || !user || !pass || !isValidFromAddress(from)) {
    return {
      ok: false,
      provider: "smtp",
      error_code: "misconfigured_email",
    };
  }

  try {
    const importNodemailer = new Function(
      "return import('nodemailer')",
    ) as () => Promise<typeof import("nodemailer")>;
    const nodemailer = await importNodemailer();
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject: SUBJECT,
      text: TEXT_BODY,
      html: HTML_BODY,
    });

    return { ok: true, provider: "smtp" };
  } catch {
    return {
      ok: false,
      provider: "smtp",
      error_code: "smtp_send_failed",
    };
  }
}
