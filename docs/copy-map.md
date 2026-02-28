# Toyb Copy Map (struttura attuale)

Documento operativo per vedere:

- dove vive ogni copy nel progetto;
- come ogni pagina si raggiunge;
- quali copy sono gia presenti;
- quali copy sono da creare o rifinire.

Data snapshot: 2026-02-28

## 1) Albero pagine e raggiungibilita

```text
/                              -> src/pages/index.astro
/#why-toyb                    -> sezione interna home (anchor)
/#creators                    -> sezione interna home (anchor)
/#preview                     -> sezione interna home (anchor)
/privacy                      -> src/pages/privacy.astro
/terms                        -> src/pages/terms.astro
/accessibility                -> src/pages/accessibility.astro
/imprint                      -> src/pages/imprint.astro
/unsubscribe                  -> src/pages/unsubscribe.astro (con query firmata da email)
/logo-lab                     -> src/pages/logo-lab.astro (pagina lab, accesso diretto)
/admin                        -> src/pages/admin/index.astro (noindex, accesso diretto)
/admin/waitlist               -> src/pages/admin/waitlist.astro (noindex, accesso diretto)
/admin/campaigns              -> src/pages/admin/campaigns/index.astro (noindex, accesso diretto)
/admin/campaigns/[id]         -> src/pages/admin/campaigns/[id].astro (noindex, da link interno admin)
/robots.txt                   -> src/pages/robots.txt.ts
```

Note raggiungibilita:

- Navbar punta solo ad anchor home (`/#why-toyb`, `/#creators`, `/#preview`) e CTA `Get early access`.
- Footer punta alle pagine legali (`/privacy`, `/accessibility`, `/terms`, `/imprint`).
- `/unsubscribe` e pensata da email (link firmato), non da nav/footer.
- `/logo-lab` non e collegata da nav/footer.
- Admin e API admin sono disallow in `robots.txt`.

## 2) Mappa copy globale (componenti shared)

### `src/components/Navbar.astro`

Copy attuale:

- `Why Toyb`
- `Built for creators`
- `Preview`
- CTA: `Get early access`

Come si raggiunge:

- visibile in tutte le pagine con `BaseLayout`.

Copy da creare/rifinire:

- definire se la CTA deve puntare a `/#preview` o alla waitlist (`/#waitlist-title` o sezione dedicata).

### `src/components/Hero.astro`

Copy attuale:

- H1: `Build universes. Break complexity.`
- subtitle default: `Toyb is a modular worldbuilding engine for creators who think in systems.`
- CTA primary: `Get early access`
- CTA secondary: `See how it works`

Come si raggiunge:

- usato nella home (`src/pages/index.astro`).

Copy da creare/rifinire:

- variante headline/subtitle per A/B test (se richiesta marketing).

### `src/components/Footer.astro`

Copy attuale:

- legal links: `Privacy`, `Accessibility`, `Terms`, `Imprint`
- firma: `{year} · toyb.space`

Come si raggiunge:

- visibile in tutte le pagine con `BaseLayout`.

Copy da creare/rifinire:

- nessun buco bloccante; solo eventuale microcopy brand nel footer.

### `src/components/ConsentBanner.astro` (feature flag)

Copy attuale:

- testo consenso essenziale + link `Privacy policy`
- azioni: `Reject`, `Accept`

Come si raggiunge:

- compare solo con `PUBLIC_ENABLE_CONSENT_BANNER=true`.

Copy da creare/rifinire:

- versione finale legale/cookie se il banner viene attivato in produzione.

## 3) Inventario copy per pagina pubblica

### `/` - `src/pages/index.astro`

Sezioni e copy attuale:

- Founder note (paragrafo narrativo founder).
- Waitlist:
  - H2 `Join the first system builders.`
  - subcopy vantaggi early access
  - placeholder input `Your email`
  - CTA `Request early access`
  - consensi privacy/marketing
  - messaggi di feedback submit/error.
- Why Toyb (3 card):
  - `Projects as universes`
  - `Narrative graph & timeline`
  - `AI-assisted coherence checks`
- Built for creators (3 bullet).
- Preview:
  - titolo/sottotitolo presenti
  - testo esplicito di placeholder preview
  - CTA `Get early access` (attualmente punta a `/imprint`)
  - CTA `See how it works`

Come si raggiunge:

- root domain (`/`), anchor da navbar.

Copy da creare/rifinire:

- P0: sostituire testo placeholder preview con copy prodotto reale + asset.
- P0: validare destinazione CTA preview primary (`/imprint` sembra non coerente con intent conversione).
- P1: rifinire messaggi feedback waitlist in tono brand unico.

### `/privacy` - `src/pages/privacy.astro`

Copy attuale:

- policy completa GDPR (11 sezioni).

Come si raggiunge:

- footer; anche da waitlist consent link (con query `?v=...`).

Copy da creare/rifinire:

- nessun placeholder evidente; solo review legale periodica.

### `/terms` - `src/pages/terms.astro`

Copy attuale:

- terms completi (12 sezioni).

Come si raggiunge:

- footer.

Copy da creare/rifinire:

- nessun placeholder evidente; review legale periodica.

### `/accessibility` - `src/pages/accessibility.astro`

Copy attuale:

- statement con scope, misure, contatto, limiti, review cycle.

Come si raggiunge:

- footer.

Copy da creare/rifinire:

- P1: la `description` include la parola `placeholder`; portarla a versione definitiva.

### `/imprint` - `src/pages/imprint.astro`

Copy attuale:

- dati operatore + email supporto.

Come si raggiunge:

- footer.

Copy da creare/rifinire:

- nessun buco copy evidente.

### `/unsubscribe` - `src/pages/unsubscribe.astro`

Copy attuale:

- messaggi di successo/errore in italiano:
  - `Sei stato disiscritto`
  - `Link non valido o scaduto`
  - CTA `Torna alla Home`

Come si raggiunge:

- link firmato in email (query: `email`, `scope`, `ts`, `sig`).

Copy da creare/rifinire:

- P1: allineare lingua con resto sito (quasi tutto in inglese) oppure formalizzare strategia bilingue.

### `/logo-lab` - `src/pages/logo-lab.astro`

Copy attuale:

- pagina interna di confronto logo (`Logo Lab`, `Pick the one that reads intentional at 16px.`).

Come si raggiunge:

- accesso diretto URL.

Copy da creare/rifinire:

- P2: decidere se mantenerla pubblica o limitarla (staging/internal).

## 4) Inventario copy area admin (noindex)

Pagine:

- `/admin` (`src/pages/admin/index.astro`)
- `/admin/waitlist` (`src/pages/admin/waitlist.astro`)
- `/admin/campaigns` (`src/pages/admin/campaigns/index.astro`)
- `/admin/campaigns/[id]` (`src/pages/admin/campaigns/[id].astro`)

Copy attuale:

- etichette dashboard, filtri, tabella, feedback auth/error/success, flusso invio campaign.

Come si raggiunge:

- accesso diretto URL, poi navigazione interna con CTA/link.

Copy da creare/rifinire:

- P2: uniformare tono dei messaggi operativi (es. `Insert admin token`, `Preview failed`, `Campaign completed`).

## 5) API map (per capire il "come ci arrivo")

Endpoint pubblici:

- `POST /api/waitlist` -> chiamato dal form in home.
- `POST /api/unsubscribe` -> chiamato da `/unsubscribe`.
- `POST /api/waitlist-test` -> endpoint di test.

Endpoint admin:

- `/api/admin/stats` -> dashboard admin.
- `/api/admin/waitlist` -> tabella waitlist admin.
- `/api/admin/beta/invite` -> azione invito beta.
- `/api/admin/beta/set-active` -> toggle beta active.
- `/api/admin/campaigns/preview` -> preview destinatari.
- `/api/admin/campaigns/send` -> invio campaign.
- `/api/admin/campaigns/[id]` -> dettaglio campaign.
- `/api/admin/campaigns/[id]/recipients` -> destinatari campaign.

Nota:

- endpoint admin non devono avere copy marketing, ma solo copy di stato chiaro e coerente.

## 6) Backlog copy prioritizzato

P0 (prima release marketing):

1. Home preview: rimuovere placeholder e inserire copy prodotto reale.
2. Home CTA preview primary: correggere destinazione se non voluta (`/imprint`).

P1 (coerenza di tono e lingua):

1. Unsubscribe: decidere lingua (EN vs IT) e uniformare.
2. Waitlist feedback: revisione microcopy error/success orientata conversione.
3. Accessibility meta description: rimuovere wording "placeholder".

P2 (igiene contenuti interni):

1. Logo lab: definire se pagina pubblica o interna.
2. Admin messages: stile unico per feedback operativi.

## 7) Dove toccare i file quando fai copy update

- Home e sezioni marketing: `src/pages/index.astro`, `src/components/Hero.astro`
- Nav e footer globali: `src/components/Navbar.astro`, `src/components/Footer.astro`
- Legal: `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/accessibility.astro`, `src/pages/imprint.astro`
- Unsubscribe flow copy: `src/pages/unsubscribe.astro`
- Admin UI copy: `src/pages/admin/**/*.astro`
- Consent text: `src/components/ConsentBanner.astro`
