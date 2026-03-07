# Toyb TechDoc (stato attuale)

Ultimo aggiornamento: **2026-03-07**

Documento tecnico di stato per il progetto `toyb.space` (landing, pagine legali, waitlist backend e admin console).

## 1) Scope

- Framework: Astro 5
- Runtime deploy: Cloudflare Pages/Workers (`@astrojs/cloudflare`)
- Output Astro: `server`
- Obiettivo: sito marketing + backend waitlist + console admin interna

## 2) Stack

- Astro + TypeScript
- CSS vanilla (`src/styles/theme.css` + `src/styles/global.css`)
- ESLint + Prettier
- `@astrojs/sitemap`
- Supabase (`@supabase/supabase-js`) per storage e RPC
- Resend API (o provider `mock`) per email
- Playwright + axe-core per smoke a11y

## 3) Struttura progetto (principale)

- `src/layouts/BaseLayout.astro`: shell globale, SEO/OG/Twitter meta, JSON-LD, favicon/manifest, skip-link, reveal script, tracking click CTA
- `src/components/`: UI condivisa (`Navbar`, `Hero`, `Section`, `FeatureGrid`, `Footer`, `Logo`, `ConsentBanner`)
- `src/pages/`: landing, legal pages, admin pages, route API, utility pages (`logo-lab`, `favicon-preview`, `robots.txt`)
- `src/lib/`: servizi waitlist/unsubscribe/admin/campaign/email
- `src/styles/`: design tokens + stili globali
- `scripts/`: test a11y/waitlist/email
- `supabase/migrations/`: schema e hardening DB
- `public/`: asset statici, screenshot landing, set favicon

## 4) Route map

### Pagine pubbliche

- `/`
- `/privacy`
- `/accessibility`
- `/terms`
- `/imprint`
- `/unsubscribe`
- `/logo-lab`
- `/favicon-preview` (noindex)
- `/robots.txt`

### Pagine admin (SSR, noindex)

- `/admin`
- `/admin/waitlist`
- `/admin/campaigns`
- `/admin/campaigns/:id`

### API

- `POST /api/waitlist`
- `OPTIONS /api/waitlist`
- `POST /api/waitlist-test`
- `GET|POST /api/unsubscribe`
- `GET /api/admin/stats`
- `GET /api/admin/waitlist`
- `POST /api/admin/beta/invite`
- `POST /api/admin/beta/set-active`
- `POST /api/admin/campaigns/preview`
- `POST /api/admin/campaigns/send`
- `GET /api/admin/campaigns/:id`
- `GET /api/admin/campaigns/:id/recipients`

## 5) Landing UI (home)

### Sezioni attuali

- Hero
- Founder note
- Waitlist
- Why Toyb (3 feature tiles)
- Built for system thinkers.
- Inside the engine. (mini-carousel narrativo)
- The Toyb workspace (overview screenshot singolo)

### Inside the engine: carousel narrativo

- 4 slide in ordine fisso:
  1. Narrative Graph
  2. Timeline
  3. AI Insights
  4. Project Health
- Navigazione manuale (frecce + dots), no autoplay
- Swipe touch su mobile (`pointer` events)
- Transizione fluida via `transform`
- `aspect-ratio: 16 / 9` per contenimento e riduzione layout shift
- Caption discreta (label + stage)

### Lightbox condivisa

- Apertura clic su slide del carousel
- Apertura anche dal blocco `The Toyb workspace` (stessa lightbox, stesso controller)
- Chiusura con:
  - bottone `X`
  - click su scrim
  - tasto `Esc`
- Navigazione in lightbox:
  - frecce prev/next UI
  - tasti freccia tastiera
- Focus handling:
  - focus al pulsante close in apertura
  - restore del focus elemento originario in chiusura
- Scroll lock body in apertura (`.preview-lightbox-open { overflow: hidden; }`)
- Modal spostata in `document.body` a runtime per evitare offset da ancestor trasformati

### Workspace section

- Screenshot singolo, grande, non in carousel
- Stile statico coerente con screenshot grandi
- Nessun hover dedicato di bordo (niente border-shift su `.workspace-shot`)
- Click-to-zoom via lightbox condivisa

## 6) Design system e stile

Token in `src/styles/theme.css`:

- Palette dark + accento ciano (`--accent: #00e5ff`)
- Scale tipografica, spaziature, radius, shadow

Regole UI rilevanti:

- `.feature-card` (Why Toyb): mantiene micro-lift hover/focus (`translateY`, border/glow)
- `.workspace-shot`: statico (no hover effect dedicato)
- Screenshot carousel/lightbox con `object-fit: contain` per leggibilità

## 7) Favicon e brand mark

### Favicon in uso (root `public/`)

- `favicon.ico`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png`
- `android-chrome-192x192.png`
- `android-chrome-512x512.png`
- `site.webmanifest`
- `og-favicon.png` (default OG image nel layout)

### Origine set favicon

- `public/favicons_complete_set/`
  - `favicons_transparent/`
  - `favicons_dark_bg/`
  - `favicons_inverted_white_bg/`
  - `favicons_black_transparent/`

### Route brand-artboard

- `/favicon-preview`: preview del solo mark `b` con accento diagonale
- Supporta background trasparente via query:
  - `?bg=transparent`
  - `?transparent=1`

## 8) SEO e metadata

In `BaseLayout`:

- Canonical URL
- Meta description + robots
- Open Graph (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`)
- Twitter card
- JSON-LD `SoftwareApplication`
- Favicon multipli + `apple-touch-icon`
- `<link rel="manifest" href="/site.webmanifest">`
- `<meta name="theme-color" content="#0b0f14">`

Indicizzazione:

- Route admin marcate `noindex,nofollow`
- `robots.txt` disallow per `/admin` e `/api/admin`
- Sitemap generata con filtro che esclude path `/admin`

## 9) Waitlist backend

### Flusso

1. Form home invia JSON a `POST /api/waitlist`
2. API valida payload e origine
3. Upsert via RPC Supabase `waitlist_upsert`
4. Invio email benvenuto con link unsubscribe firmato

### Validazioni e controlli attivi

- CORS allowlist (`WAITLIST_ALLOWED_ORIGINS`, fallback include localhost)
- `Content-Type` JSON richiesto
- Body limit: 2KB
- Honeypot `company`
- Validazione email
- Consensi richiesti:
  - `age_confirmed === true`
  - `privacy_accepted === true`
  - `marketing_consent` boolean
  - `privacy_version` obbligatoria
- Rate limiting soft in-memory per IP hash (SHA-256 + salt)

### Email

- Provider selezionato da `EMAIL_PROVIDER` (`mock` o `resend`)
- Fallback automatico:
  - con `RESEND_API_KEY` presente tende a `resend`
  - in dev senza key usa `mock`
- Oggetto dinamico:
  - con consenso marketing: `Welcome to Toyb (marketing enabled)`
  - senza consenso marketing: `Welcome to Toyb`

### Unsubscribe

- Endpoint `GET|POST /api/unsubscribe`
- Firma HMAC (`WAITLIST_UNSUBSCRIBE_SECRET`) con token time-bound
- Applicazione unsubscribe via RPC `waitlist_apply_unsubscribe`

### Nota Turnstile (stato corrente)

- Frontend può mostrare widget Turnstile (`WAITLIST_TURNSTILE_ENABLED` + `TURNSTILE_SITE_KEY`)
- Il token viene inviato dal client ma **non è verificato server-side** nell’attuale implementazione di `POST /api/waitlist`

## 10) Admin console e campagne

### Auth admin

- Header richiesto: `Authorization: Bearer <WAITLIST_ADMIN_TOKEN>`
- Same-origin enforcement con `ADMIN_ALLOWED_ORIGINS`
- Confronto token timing-safe

### Funzioni admin

- Dashboard statistiche waitlist/beta
- Listing waitlist con filtri (marketing, source, beta, subscribed_only, date range)
- Beta invite e toggle beta-active
- Campaign preview recipient
- Campaign send con tracciamento stato recipient (sent/failed)
- Campaign detail + paginazione recipients

### Safety campaigns

- Segmento campagne forzato lato server a:
  - `marketing_only = true`
  - `subscribed_only = true`
- Include link unsubscribe firmato in ogni email campagna

## 11) Migrations Supabase presenti

- `20260223184000_create_waitlist.sql`
- `20260223200500_waitlist_rpc_hardening.sql`
- `20260226153000_waitlist_consents.sql`
- `20260226174000_waitlist_checkbox_consents.sql`
- `20260227190000_waitlist_refactor.sql`
- `20260227194000_admin_console.sql`
- `20260227203000_campaign_send_guard.sql`
- `20260228164000_campaign_retry_failed.sql`

## 12) CI/CD

### CI (`.github/workflows/ci.yml`)

1. `npm ci`
2. `npm run lint`
3. `npm run format`
4. `npm run typecheck`
5. `npm run test`
6. `npm run build`
7. `npx playwright install --with-deps chromium`
8. `npm run test:a11y`

### Deploy (`.github/workflows/deploy.yml`)

- Trigger: push su `main` + manual dispatch
- Build Astro
- Deploy `dist` su Cloudflare Pages via `wrangler-action`

## 13) Script utili

- `npm run dev`
- `npm run check`
- `npm run test`
- `npm run test:waitlist`
- `npm run test:email`
- `npm run test:a11y`
- `npm run deploy`

## 14) Env vars (allineate al codice)

### Public/client

- `PUBLIC_SITE_URL`
- `PUBLIC_ENABLE_CONSENT_BANNER` (opzionale)
- `WAITLIST_TURNSTILE_ENABLED` (opzionale, UI widget)
- `TURNSTILE_SITE_KEY` (opzionale, UI widget)

### Server-only

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WAITLIST_FROM`
- `WAITLIST_IP_SALT`
- `WAITLIST_ALLOWED_ORIGINS`
- `WAITLIST_UNSUBSCRIBE_SECRET`
- `WAITLIST_UNSUBSCRIBE_BASE_URL`
- `WAITLIST_ADMIN_TOKEN`
- `ADMIN_ALLOWED_ORIGINS`
- `EMAIL_PROVIDER` (`mock|resend`)
- `RESEND_API_KEY` (necessaria con `EMAIL_PROVIDER=resend`)

## 15) Note operative

- Dopo update favicon/manifest può servire hard refresh per invalidare cache browser.
- Le route admin sono escluse da robots/sitemap ma restano raggiungibili con URL diretto.
- Se si vuole enforcement anti-bot reale, va aggiunta verifica server-side Turnstile in `POST /api/waitlist`.
