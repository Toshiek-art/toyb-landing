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

export interface EmailSendResult {
  ok: boolean;
  provider: "resend" | "smtp";
  error?: string;
}

interface SendWelcomeEmailInput {
  to: string;
  env: WaitlistEmailEnv;
}

const DEFAULT_FROM = "Toyb <hello@toyb.space>";
const SUBJECT = "Welcome to the Trybe.";
const TEXT_BODY = `You're early. That matters.
We'll write soon.
— Toyb`;
const HTML_BODY = `<p>You're early. That matters.<br/>We'll write soon.<br/>— Toyb</p>`;

export async function sendWaitlistWelcomeEmail(
  input: SendWelcomeEmailInput,
): Promise<EmailSendResult> {
  const provider = (
    input.env.WAITLIST_EMAIL_PROVIDER ?? "resend"
  ).toLowerCase();

  if (provider === "smtp") {
    return sendViaSmtp(input);
  }

  return sendViaResend(input);
}

async function sendViaResend({
  to,
  env,
}: SendWelcomeEmailInput): Promise<EmailSendResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      provider: "resend",
      error: "Missing RESEND_API_KEY",
    };
  }

  // TODO: verify and authenticate toyb.space in Resend before production sending.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.WAITLIST_FROM ?? DEFAULT_FROM,
      to: [to],
      subject: SUBJECT,
      text: TEXT_BODY,
      html: HTML_BODY,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      provider: "resend",
      error: `Resend HTTP ${response.status}: ${errorBody}`,
    };
  }

  return { ok: true, provider: "resend" };
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
      error: "SMTP fallback is only available in a Node runtime",
    };
  }

  if (nodeEnv !== "development") {
    return {
      ok: false,
      provider: "smtp",
      error: "SMTP fallback is disabled outside development",
    };
  }

  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT ?? "587");
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    return {
      ok: false,
      provider: "smtp",
      error: "Missing SMTP_* configuration",
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
      from: env.WAITLIST_FROM ?? DEFAULT_FROM,
      to,
      subject: SUBJECT,
      text: TEXT_BODY,
      html: HTML_BODY,
    });

    return { ok: true, provider: "smtp" };
  } catch (error) {
    return {
      ok: false,
      provider: "smtp",
      error: error instanceof Error ? error.message : "SMTP send failed",
    };
  }
}
