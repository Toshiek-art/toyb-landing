# Waitlist Backend

This project includes a server endpoint at `POST /api/waitlist` for signup storage and welcome email automation.

## Flow

1. Frontend submits `{ email, source, company }` to `/api/waitlist`.
2. Server validates + normalizes email, applies honeypot and soft rate-limit.
3. Server calls Supabase RPC `insert_waitlist(...)` (SECURITY DEFINER).
4. If row is new, server sends welcome email via Resend (default).
5. Response shape:

```json
{
  "ok": true,
  "already_joined": false,
  "email_sent": true
}
```

## 1) Supabase setup

1. Create a Supabase project.
2. Run migrations:

```sql
-- file: supabase/migrations/20260223184000_create_waitlist.sql
-- file: supabase/migrations/20260223200500_waitlist_rpc_hardening.sql
```

3. Copy project credentials:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (server-side use in API route)

## 2) Email setup (Resend)

1. Create a Resend API key.
2. Set:
   - `RESEND_API_KEY`
   - `WAITLIST_FROM="Toyb <hello@toyb.space>"`
3. Verify domain/sender in Resend for production sending from `toyb.space`.

## 3) Cloudflare env vars

Set these in Cloudflare Pages/Workers environment variables (Production + Preview):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `WAITLIST_FROM`
- `WAITLIST_IP_SALT`
- optional: `WAITLIST_EMAIL_PROVIDER`
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
  -d '{"email":"hello@example.com","source":"landing","company":""}'
```

Expected:

- first submit: `ok=true`, `already_joined=false`
- repeated submit: `ok=true`, `already_joined=true`
