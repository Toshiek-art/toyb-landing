# Waitlist Backend

This project includes:

- `POST /api/waitlist` for signup storage + welcome email automation.
- `POST /api/waitlist-test` for protected, direct email self-test.
- `GET|POST /api/unsubscribe` for scoped opt-out (`all` or `marketing`).

## Flow

1. Frontend submits `{ email, source, company, age_confirmed, privacy_accepted, marketing_consent }` to `/api/waitlist`.
2. Server validates + normalizes email, applies honeypot and soft rate-limit.
3. Server rejects requests without required consents (`age_confirmed=true`, `privacy_accepted=true`).
4. Server calls Supabase RPC `insert_waitlist(...)` (SECURITY DEFINER).
5. If row is new, server attempts welcome email via Resend (default).
6. Duplicate rows do not trigger email by default (`WAITLIST_SEND_ON_DUPLICATE=false`).
7. Every JSON response includes `request_id`.
8. Response shape:

```json
{
  "ok": true,
  "already_joined": false,
  "email_sent": true,
  "request_id": "1e6fbcd9-a8ac-4b03-b6e4-08eff7ef9808"
}
```

## 1) Supabase setup

1. Create a Supabase project.
2. Run migrations:

```sql
-- file: supabase/migrations/20260223184000_create_waitlist.sql
-- file: supabase/migrations/20260223200500_waitlist_rpc_hardening.sql
-- file: supabase/migrations/20260226153000_waitlist_consents.sql
-- file: supabase/migrations/20260226174000_waitlist_checkbox_consents.sql
```

3. Copy project credentials:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (server-side use in API route)

## 2) Email setup (Resend)

1. Create a Resend API key.
2. Set (required):
   - `RESEND_API_KEY`
   - `WAITLIST_FROM="Toyb <hello@toyb.space>"`
3. Verify domain/sender in Resend for production sending from `toyb.space`.
4. `WAITLIST_FROM` must contain a valid email address at your verified sender domain.

## 3) Cloudflare env vars

Set these in Cloudflare Pages/Workers environment variables (Production + Preview):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `WAITLIST_FROM`
- `WAITLIST_IP_SALT`
- `WAITLIST_ADMIN_TOKEN` (server-only, protects `/api/waitlist-test`)
- optional: `WAITLIST_EMAIL_PROVIDER`
- optional: `WAITLIST_SEND_ON_DUPLICATE` (`true`/`false`, default `false`)
- optional: `WAITLIST_TURNSTILE_ENABLED` (`true`/`false`, default `false`)
- optional: `TURNSTILE_SITE_KEY` (public widget key)
- optional: `TURNSTILE_SECRET_KEY` (server secret for verification)

## 3.1) Optional Cloudflare Turnstile

When `WAITLIST_TURNSTILE_ENABLED=true`, frontend renders Turnstile and backend verifies
`turnstileToken` with:

- `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`

If verification fails, API returns:

```json
{ "ok": false, "error": "bot_suspected" }
```

## 4) Optional SMTP fallback (local/dev only)

Set:

- `WAITLIST_EMAIL_PROVIDER=smtp`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`

This uses `nodemailer` and is intended for Node runtime only (not Cloudflare Workers).

## 5) Test with curl

```bash
curl -i -X POST http://localhost:4321/api/waitlist \
  -H "content-type: application/json" \
  -d '{"email":"hello@example.com","source":"landing","company":"","age_confirmed":true,"privacy_accepted":true,"marketing_consent":false}'
```

Expected:

- first submit: `ok=true`, `already_joined=false`, `request_id` present
- repeated submit: `ok=true`, `already_joined=true`, `email_sent=false`
- missing age consent: `400` + `error="invalid_request"` + `error_code="age_required"`
- missing privacy consent: `400` + `error="invalid_request"` + `error_code="privacy_required"`

## 6) Protected self-test endpoint

Use this to verify email delivery path directly (without waitlist insert):

```bash
curl -i -X POST http://localhost:4321/api/waitlist-test \
  -H "content-type: application/json" \
  -H "x-admin-token: $WAITLIST_ADMIN_TOKEN" \
  -d '{"email":"you@example.com"}'
```

Response includes:

- `request_id`
- `email_sent`

Local helper script:

```bash
WAITLIST_ADMIN_TOKEN=... WAITLIST_TEST_EMAIL=you@example.com npm run test:email
```

## 7) Unsubscribe endpoint

All communications:

```bash
curl -i "http://localhost:4321/api/unsubscribe?email=hello@example.com&scope=all"
```

Only marketing/newsletter:

```bash
curl -i "http://localhost:4321/api/unsubscribe?email=hello@example.com&scope=marketing"
```

Response includes:

- `request_id`
- `scope`
- `updated`
- `unsubscribed_all`
- `unsubscribed_marketing`

## 8) Recipient filters (Resend campaigns/batches)

Product updates / early access:

- `consent_waitlist = true`
- `unsubscribed_all = false`

Newsletter / marketing:

- `marketing_consent = true`
- `unsubscribed_marketing = false`
- `unsubscribed_all = false`

DB helper functions (service role):

- `public.waitlist_recipients_product_updates()`
- `public.waitlist_recipients_marketing()`

## 9) Inspect waitlist rows

```sql
select
  email,
  age_confirmed,
  privacy_accepted,
  marketing_consent,
  privacy_version,
  privacy_accepted_at,
  marketing_consent_at
from public.waitlist
order by created_at desc
limit 50;
```

## 10) Observability

Server logs are structured and sanitized:

```json
{
  "request_id": "...",
  "stage": "...",
  "provider": "resend",
  "email_sent": false,
  "already_joined": false,
  "error_code": "misconfigured_email",
  "email_hash_prefix": "ab12cd34"
}
```
