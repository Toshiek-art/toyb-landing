# Toyb Landing TechDoc

Documento tecnico di stato della landing `toyb.space` con tutto ciò che è incluso al momento.

## 1) Scope

- Framework: Astro
- Runtime deploy: Cloudflare (`@astrojs/cloudflare`)
- Obiettivo: landing marketing + pagine legali + conversione waitlist con hardening sicurezza

## 2) Stack

- Astro 5 + TypeScript
- CSS vanilla (design tokens + global styles)
- ESLint + Prettier
- `@astrojs/sitemap`
- Cloudflare adapter
- Supabase (`@supabase/supabase-js`) per waitlist
- Resend via HTTP API per welcome email
- Playwright + axe-core per test a11y

## 3) Struttura progetto (principale)

- `src/layouts/BaseLayout.astro`: shell globale, meta SEO/OG, JSON-LD, skip-link, reveal script
- `src/components/`: componenti UI riusabili (`Navbar`, `Hero`, `FeatureGrid`, `Section`, `Footer`, `Logo`, `ConsentBanner`)
- `src/pages/`: home, pagine legali, `logo-lab`, API route waitlist, `robots.txt`
- `src/styles/theme.css`: token design system
- `src/styles/global.css`: reset, tipografia, layout, component styles, motion/accessibility
- `src/lib/analytics.ts`: stub tracking (`noop`)
- `src/lib/email.ts`: invio email (Resend default, SMTP fallback dev-only)
- `supabase/migrations/`: schema + hardening DB + RPC
- `scripts/test-a11y.mjs`: a11y smoke via axe
- `scripts/test-waitlist.mjs`: waitlist smoke test API

## 4) Pagine incluse

- `/` landing principale
- `/privacy`
- `/cookies`
- `/accessibility`
- `/terms`
- `/imprint`
- `/logo-lab` (non in nav)
- `/robots.txt`
- `/api/waitlist` (server)

## 5) Landing UI (home)

### Sezioni

- Hero con headline: `Build universes. Break complexity.`
- Founder Note (sotto Hero)
- Waitlist block (form email)
- Why Toyb (3 card)
- Built for creators
- Preview + CTA

### Componentizzazione

- Navbar minimal con logo `toyb` e CTA
- Hero separato con markup semantico e wrapping controllato del titolo
- Section + FeatureGrid riusabili
- Footer con link legali

## 6) Design system e stile

Token centralizzati in `src/styles/theme.css`:

- Colori: `--bg`, `--surface`, `--text`, `--muted`, `--border`, `--accent`
- Tipografia: scale + line-height
- Spaziature: `--space-*`
- Radius, shadow, blur, max-width

Direzione visuale implementata:

- Tema dark/minimal autorevole
- Accento unico ciano `#00E5FF`
- Wordmark ribelle controllato (`Logo` variante `slice`/`bar`)
- Hero con aura animata + frattura tipografica su “Break”
- Motion sobria e rispettosa di `prefers-reduced-motion`

## 7) Accessibilità implementata

- Skip link funzionante
- Focus ring `:focus-visible` su elementi interattivi
- Contrasto alto (palette calibrata AA)
- Landmark semantici (`header`, `main`, `footer`, `nav`)
- Reveal animations disabilitate con `prefers-reduced-motion: reduce`
- Test automatici axe-core su route principali (`scripts/test-a11y.mjs`)

Riferimenti in documentazione:

- EN 301 549 / WCAG 2.1 A/AA (baseline tecnica, nessun claim legale)

## 8) SEO e metadata

In `BaseLayout`:

- Canonical URL
- Meta description
- Open Graph + Twitter card
- JSON-LD `SoftwareApplication` (Toyb)
- Sitemap via `@astrojs/sitemap`
- `robots.txt` generato

## 9) Consent e analytics

- `ConsentBanner` presente ma disattivato di default
- Flag: `PUBLIC_ENABLE_CONSENT_BANNER=true`
- Scelta salvata in localStorage (`accepted`/`rejected`)
- `src/lib/analytics.ts` è stub `track(...)` (nessun tracking reale attivo)

## 10) Waitlist backend (attuale)

### Frontend

- Form su home con:
  - email
  - honeypot `company`
  - Turnstile opzionale (feature-flag)
- Submit via `fetch` a `POST /api/waitlist`
- Messaggi UX:
  - nuovo utente
  - già iscritto
  - errore generico

### API route (`src/pages/api/waitlist.ts`)

Controlli attivi:

- CORS strict + allowlist origin:
  - `https://toyb.space`
  - `https://www.toyb.space`
  - `https://*.pages.dev`
- Metodi ammessi: `POST`, `OPTIONS`
- `Content-Type` richiesto: `application/json`
- Limite payload: 2KB
- Rate limit soft in-memory per IP/UA
- Honeypot anti-bot
- Turnstile verify opzionale (`siteverify`)
- Error hygiene (codici generici)
- Log privacy-safe:
  - `request_id`
  - `timestamp`
  - `ip_hash_prefix`
  - `email_hash_prefix`

### Persistenza Supabase (hardening)

Migrazioni:

- `20260223184000_create_waitlist.sql` (tabella base)
- `20260223200500_waitlist_rpc_hardening.sql` (hardening)

Hardening DB incluso:

- Constraint su email/source/user_agent/ip_hash
- Unique index su `lower(email)` (dedup case-insensitive)
- RLS attiva su `waitlist`
- Accesso diretto tabella negato ad `anon/authenticated`
- Funzione RPC `insert_waitlist(...)` con `SECURITY DEFINER`
- API usa `SUPABASE_ANON_KEY` + RPC (no service-role key in runtime app)

### Email welcome

- Provider default: Resend (HTTP, compatibile Cloudflare)
- Subject: `Welcome to the Trybe.`
- Body breve brand-consistent
- SMTP fallback presente ma bloccata fuori da `NODE_ENV=development`

## 11) Turnstile (feature-flag)

Variabili:

- `WAITLIST_TURNSTILE_ENABLED` (`true|false`, default `false`)
- `TURNSTILE_SITE_KEY` (public)
- `TURNSTILE_SECRET_KEY` (server)

Comportamento:

- Se flag `false`: nessun widget, nessun script Turnstile
- Se flag `true`: widget renderizzato, token inviato in payload, verifica server-side
- Fail verify => `403 { ok:false, error:"bot_suspected" }`

## 12) CI/CD e deploy

### CI (`.github/workflows/ci.yml`)

Esegue su push/PR:

1. `npm ci`
2. `npm run lint`
3. `npm run format`
4. `npm run typecheck`
5. `npm run build`
6. install Chromium Playwright
7. `npm run test:a11y`

### Deploy (`.github/workflows/deploy.yml`)

- Trigger: push su `main` + manual dispatch
- Build Astro
- Deploy `dist` su Cloudflare Pages via `wrangler-action`

## 13) Test script utili

- A11y: `npm run test:a11y`
- Waitlist smoke:
  - `node scripts/test-waitlist.mjs`
  - env utili:
    - `BASE_URL` (default `http://localhost:4321`)
    - `WAITLIST_TEST_ORIGIN` (default `https://toyb.space`)
    - `TURNSTILE_TOKEN` (se Turnstile attivo)

## 14) Env vars (attuali)

Public/client:

- `PUBLIC_SITE_URL`
- `PUBLIC_ENABLE_CONSENT_BANNER` (opzionale)
- `TURNSTILE_SITE_KEY` (solo quando Turnstile attivo)

Server-only:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- `WAITLIST_FROM`
- `WAITLIST_IP_SALT`
- `WAITLIST_EMAIL_PROVIDER`
- `WAITLIST_TURNSTILE_ENABLED`
- `TURNSTILE_SECRET_KEY`
- `SMTP_*` (solo fallback dev)

## 15) Note operative

- Per waitlist in produzione servono entrambe le migration Supabase.
- Per invio email con dominio custom va verificato sender/domain in Resend.
- Lo smoke test waitlist fallisce se il server locale non è avviato o non raggiungibile.
