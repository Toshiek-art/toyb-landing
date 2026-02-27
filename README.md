# Toyb Website

[![CI](https://github.com/tosiek/toyb/actions/workflows/ci.yml/badge.svg)](https://github.com/tosiek/toyb/actions/workflows/ci.yml)

Astro-based marketing and policy site for **Toyb**, with an accessibility-first baseline, CI quality checks, and Cloudflare Pages deployment.

## Stack

- Astro + TypeScript
- ESLint + Prettier
- @astrojs/sitemap
- Playwright + axe-core accessibility checks
- GitHub Actions CI/CD

## Quick start

```bash
npm install
npm run dev
```

## Commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start local development server            |
| `npm run lint`      | Run ESLint                                |
| `npm run format`    | Check formatting (fails if not compliant) |
| `npm run typecheck` | Run TypeScript typecheck                  |
| `npm run check`     | Run typecheck + `astro check`             |
| `npm run build`     | Build static output into `dist/`          |
| `npm run test`       | Run backend tests (token + API)           |
| `npm run test:waitlist` | Run waitlist smoke script (server required) |
| `npm run test:email` | Call protected `/api/waitlist-test`       |
| `npm run test:a11y` | Run axe-core checks on built pages        |
| `npm run deploy`    | One-command Cloudflare Pages deploy       |

## Waitlist backend

- API route: `POST /api/waitlist`
- Admin test route: `POST /api/waitlist-test` (header `X-Admin-Token`)
- Admin APIs: `GET|POST /api/admin/*` (header `Authorization: Bearer <WAITLIST_ADMIN_TOKEN>`)
- Unsubscribe page: `GET /unsubscribe?email=...&scope=...&ts=...&sig=...`
- Unsubscribe API: `GET|POST /api/unsubscribe`
- Stores emails in Supabase table `waitlist`
- Uses Supabase RPC + RLS with `SUPABASE_ANON_KEY` (no service-role key in app runtime)
- Sends waitlist email using:
  - `EMAIL_PROVIDER=mock` (local/dev/tests, no network call)
  - `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (production)
- Unsubscribe is protected with HMAC signature (`WAITLIST_UNSUBSCRIBE_SECRET`, TTL 7 days)

### Local dev setup

Required env vars (see `.env.example`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WAITLIST_ADMIN_TOKEN`
- `WAITLIST_FROM`
- `WAITLIST_IP_SALT`
- `WAITLIST_ALLOWED_ORIGINS`
- `WAITLIST_UNSUBSCRIBE_SECRET`
- `WAITLIST_UNSUBSCRIBE_BASE_URL`
- `EMAIL_PROVIDER=mock` (recommended locally)

For production email delivery:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`

Setup details:

- `docs/waitlist.md`
- `docs/landing-techdoc.md`
- `.env.example`

Quick smoke test (API waitlist):

```bash
EMAIL_PROVIDER=mock npm run test:waitlist
```

Direct email self-test:

```bash
WAITLIST_ADMIN_TOKEN=... WAITLIST_TEST_EMAIL=you@example.com npm run test:email
```

Unsubscribe page manual QA:

1. Open `/unsubscribe` without query params -> page shows `Link non valido o scaduto`.
2. Open `/unsubscribe?email=...&scope=marketing&ts=...&sig=...` with a valid signed token -> page calls `POST /api/unsubscribe` and shows `Sei stato disiscritto`.

## Admin console

- Pages:
- `/admin` dashboard
- `/admin/waitlist` waitlist manager
- `/admin/campaigns` campaign composer
- `/admin/campaigns/:id` campaign detail
- All admin APIs require `Authorization: Bearer <WAITLIST_ADMIN_TOKEN>`.
- Admin pages are marked `noindex,nofollow`.
- Campaign safety guard: recipient selection always enforces `marketing_consent=true` and `unsubscribed_at is null`.

### Local admin usage

1. Run dev server with mock email:

```bash
EMAIL_PROVIDER=mock npm run dev
```

2. Open `http://localhost:4321/admin`.
3. Paste `WAITLIST_ADMIN_TOKEN` in the auth field.
4. Preview and send a test campaign from `/admin/campaigns`.

Expected in mock mode:

- Send completes without calling Resend.
- Campaign detail page shows recipients with `status=sent`.

## Logo wordmark (`toyb`)

Il wordmark è implementato come componente riusabile in `src/components/Logo.astro`, con 2 varianti:

- `slice` (default): micro-frattura diagonale sulla lettera `b`
- `bar`: separatore integrato `toy|b`

Props supportate:

- `variant`: `"slice" | "bar"` (default: `"slice"`)
- `size`: `"sm" | "md" | "lg"` (default: `"md"`)
- `asLink`: `boolean` (default: `true`, link a `/`)

### Markup usato

```astro
---
interface Props {
  variant?: "slice" | "bar";
  size?: "sm" | "md" | "lg";
  asLink?: boolean;
}

const { variant = "slice", size = "md", asLink = true } = Astro.props as Props;
const classes = `logo logo--${variant} logo--${size}`;
---

{
  asLink ? (
    <a href="/" class={classes} aria-label="toyb home">
      <>
        <span class="logo__t">toy</span>
        <span class="logo__b">b</span>
      </>
    </a>
  ) : (
    <span class={classes} role="img" aria-label="toyb">
      <>
        <span class="logo__t">toy</span>
        <span class="logo__b">b</span>
      </>
    </span>
  )
}
```

### CSS principale usato

```css
.logo {
  --logo-size: 1.3125rem;
  --logo-cut-thickness: 0.075em;
  --logo-cut-color: var(--bg);
  --logo-slice-angle: -20deg;
  display: inline-flex;
  align-items: baseline;
  font-family: var(--font-heading);
  font-size: var(--logo-size);
  font-weight: 700;
  line-height: 1;
  text-transform: lowercase;
  color: var(--text);
}

.logo--sm {
  --logo-size: 1rem;
}
.logo--md {
  --logo-size: 1.3125rem;
}
.logo--lg {
  --logo-size: 1.875rem;
}

.logo--slice .logo__b::before {
  content: "";
  position: absolute;
  width: 0.92em;
  height: var(--logo-cut-thickness);
  background: var(--logo-cut-color);
  transform: rotate(var(--logo-slice-angle));
}

.logo--slice .logo__b::after {
  content: "";
  position: absolute;
  width: 0.74em;
  background: var(--accent);
  opacity: 0.24;
  transform: rotate(var(--logo-slice-angle));
}

.logo--bar .logo__t::after {
  content: "";
  position: absolute;
  width: 1px;
  height: 0.74em;
  background: color-mix(in srgb, var(--accent) 85%, transparent);
  opacity: 0.85;
}
```

### Dove si cambia la variante

Nel navbar (`src/components/Navbar.astro`):

```astro
<Logo variant="slice" size="md" asLink />
```

Per testare A/B visivamente:

- pagina laboratorio: `/logo-lab`
- file: `src/pages/logo-lab.astro`

## Accessibility baseline

The project follows a practical baseline aligned with:

- EN 301 549 (reference baseline)
- WCAG 2.1 A/AA (automated rule tags via axe-core)

This reference is implementation guidance only and **not a legal compliance claim**.

### Run accessibility tests locally

1. Build the site:

```bash
npm run build
```

2. Install Playwright Chromium (first run only):

```bash
npx playwright install chromium
```

3. Run checks:

```bash
npm run test:a11y
```

## Consent banner (feature-flagged)

`src/components/ConsentBanner.astro` is included but **disabled by default**.

Enable it only when you add non-essential scripts/cookies:

```bash
PUBLIC_ENABLE_CONSENT_BANNER=true npm run dev
```

Behavior:

- Does not set optional cookies by default.
- Stores user consent choice (`accepted` / `rejected`) in local storage.
- Shows equal-weight **Reject** and **Accept** actions.
- Links to `/privacy` policy page.

## SEO and metadata

Implemented baseline:

- Canonical site URL: `https://toyb.space/`
- Meta description and OG tags in shared layout
- JSON-LD `SoftwareApplication` for Toyb
- Auto-generated sitemap via `@astrojs/sitemap`
- Generated `robots.txt` endpoint

## CI

Workflow: `.github/workflows/ci.yml`

Runs on push and pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run format` (format check, fails on mismatch)
4. `npm run typecheck`
5. `npm run build`
6. `npx playwright install --with-deps chromium`
7. `npm run test:a11y`

## Deploy to Cloudflare Pages

Workflow: `.github/workflows/deploy.yml`

### Required GitHub secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Required GitHub variable

- `CLOUDFLARE_PAGES_PROJECT` (example: `toyb`)

### Domain setup (`toyb.space`)

In Cloudflare Pages project settings:

1. Add custom domain `toyb.space`.
2. Configure DNS records in Cloudflare.
3. Ensure HTTPS is active.

### Local one-command deploy

```bash
CLOUDFLARE_PAGES_PROJECT=toyb npm run deploy
```

This command builds the site and runs `wrangler pages deploy dist`.
