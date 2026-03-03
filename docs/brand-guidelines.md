# Toyb Landing Brand Guidelines and Design System

Version: 2026-03-01  
Scope: public landing (`/`) + shared UI primitives used by legal and utility pages.

This document is the practical reference for brand expression and UI consistency on `toyb.space`.

## 1) Brand foundations

### 1.1 Positioning

Toyb is presented as infrastructure for narrative systems, not a generic writing app.

### 1.2 Core message

- Build universes. Break complexity.
- System thinking over document sprawl.
- Coherence at scale through structure and constraints.

### 1.3 Voice and tone

- Direct, precise, technical-confident.
- Short sentences with high semantic density.
- Avoid hype language, vague superlatives, or startup cliches.
- Prefer verbs that imply structure: `model`, `track`, `surface`, `connect`, `scale`.

### 1.4 Writing style

- Primary language: English for public marketing and legal UX.
- Keep CTA labels action-oriented and concrete.
- Keep supporting microcopy calm and informative.
- Avoid mixing language within the same user flow.

## 2) Visual identity system

Source of truth:

- `src/styles/theme.css`
- `src/styles/global.css`
- `src/components/Logo.astro`

### 2.1 Color tokens

```css
--bg: #0b0f14;
--surface: #111826;
--text: #eaf0ff;
--muted: #a7b0c0;
--border: rgb(255 255 255 / 0.08);
--accent: #00e5ff;
--focus: var(--accent);
```

Extended utility tokens:

- `--accent-fade`
- `--accent-border`
- `--accent-border-soft`
- `--accent-glow-soft`
- `--accent-glow-hero`
- `--overlay-soft`
- `--overlay-grid`

Usage rules:

- Use accent for intent and interaction, not for large text blocks.
- Keep body text on `--muted` and key headings on `--text`.
- Never introduce ad-hoc hex values in components; use tokens.

### 2.2 Typography

Token fonts:

- Heading: `"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif`
- Body: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`

Type scale:

- `--text-xs: 0.8125rem`
- `--text-sm: 0.9375rem`
- `--text-md: 1rem`
- `--text-lg: 1.125rem`
- `--text-xl: 1.5rem`
- `--text-2xl: 2rem`
- `--text-3xl: clamp(2.1rem, 5vw, 4.4rem)`

Rules:

- Headings use heading font, tight line height, slight negative tracking.
- Paragraphs default to muted color; promote to text color only with intent.
- Keep hero headline split and emphasis pattern consistent with existing implementation.

### 2.3 Spacing, radius, depth

Spacing tokens:

- `--space-1` to `--space-8` (0.25rem -> 4.5rem)

Radius tokens:

- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`

Shadow tokens:

- `--shadow-soft`, `--shadow-md`, `--shadow-glow`

Rules:

- Use token spacing for all margins, paddings, and gaps.
- Pills are reserved for actions and compact inputs.
- Glow is interactive feedback, not decorative noise.

## 3) Logo and mark usage

Source:

- `src/components/Logo.astro`
- global classes in `src/styles/global.css` (`.logo*`)

Available variants:

- `slice` (default)
- `bar`

Available sizes:

- `sm`, `md`, `lg`

Behavior:

- Primary nav uses interactive cursor variant (`experimentalCursor`) with blinking accent block.
- Footer uses non-linked compact logo.

Rules:

- Do not stretch or recolor logo outside tokenized system colors.
- Preserve lowercase rendering (`toyb`).
- Keep logo on dark surfaces for contrast integrity.

## 4) Layout and grid

Source:

- `.layout-shell` in `src/styles/global.css`

Container model:

- `width: min(var(--max-width), calc(100% - 2.5rem))`
- `--max-width: 72rem`

Section rhythm:

- major vertical rhythm around `--space-7` and `--space-8`
- cards and internal stacks around `--space-3` to `--space-5`

Rules:

- Keep the current landing rhythm; avoid one-off spacing overrides.
- Prefer composition via existing section/card primitives.

## 5) Core components and usage

### 5.1 Navigation (`Navbar`)

- Minimal anchor navigation to home sections.
- One primary CTA in header.
- Nav links remain muted until hover/focus.

### 5.2 Buttons

Classes:

- `.button`
- `.button-primary`
- `.button-secondary`

Behavior:

- subtle lift on hover (`translateY(-2px)`)
- accent border and glow on interaction

Rules:

- Keep label case sentence-style.
- Avoid adding icon clutter unless semantically necessary.

### 5.3 Hero

- Uses layered gradients, moving aura, and highlight fracture on `Break`.
- Copy structure: high-conviction headline + concise subtitle + 2 CTAs.

Rules:

- Keep headline in two-part rhythm.
- Keep subtitle within ~60ch readability limit.

### 5.4 Section primitive (`Section.astro`)

- Standardized section header with title and optional subtitle.
- Shared `section-head` and `section-content` structure.

Rules:

- Reuse `Section` for new blocks instead of custom wrappers.

### 5.5 Feature cards (`FeatureGrid`)

- 3-up grid on desktop, stacked on mobile.
- Card top accent rule and subtle hover feedback.

Rules:

- Keep each card to one idea.
- Prefer 1 heading + 1 concise supporting paragraph.

### 5.6 Waitlist block

- Centered intent block with email capture and compliance checkboxes.
- Supporting texts:
  - `.waitlist__sub` for explanatory line
  - `.waitlist__note` for subtle secondary line

Rules:

- Keep the flow: heading -> subcopy -> note -> input/cta -> consents -> feedback.
- Consent text must stay explicit and legible.

### 5.7 Preview block

- Framed placeholder/visual area + explanatory narrative copy + subtle note + CTA row.
- Supporting subtle line uses `.preview-note`.

Rules:

- Keep copy structure dense and system-oriented.
- Keep CTA row and button hierarchy unchanged unless product strategy changes.

### 5.8 Footer and legal nav

- Quiet legal footer with compact links and current year.

Rules:

- Legal links stay concise and neutral.

## 6) Motion and interaction

Source:

- keyframes in `src/styles/global.css`
- reveal script in `src/layouts/BaseLayout.astro`

Motion set:

- Hero background/aura/veil animations.
- One-time reveal transitions for `[data-reveal]`.
- Logo cursor blink (can be disabled by reduced-motion setting).

Accessibility fallback:

- `prefers-reduced-motion: reduce` disables animations/transitions.
- Smooth scrolling disabled under reduced motion.

Rules:

- Motion must communicate depth/attention, not novelty.
- New animations must ship with reduced-motion fallback.

## 7) Accessibility standards

Implemented baseline:

- Skip link to main content.
- Strong `:focus-visible` ring.
- Semantic landmarks (`header`, `main`, `footer`, `nav`).
- Contrast-friendly dark palette.
- Live regions for waitlist feedback.

Rules:

- Do not remove skip link or focus styles.
- Keep interactive targets keyboard reachable.
- Maintain descriptive `aria-label` values for non-text visuals.

## 8) Responsive behavior

Breakpoints:

- `@media (min-width: 48rem)`
- `@media (min-width: 64rem)`
- `@media (max-width: 47.99rem)`

Current responsive logic:

- Nav collapses to two-row grid on small screens.
- Waitlist input/button stack on mobile, row layout on tablet+.
- Feature grid: 1 column mobile, 3 columns desktop.
- Creators grid: single column mobile, 2 columns desktop.

Rules:

- Preserve existing breakpoint strategy.
- Prefer tokenized spacing and fluid clamp values over new hard widths.

## 9) Content architecture for landing sections

Recommended sequence:

1. Hero (positioning + immediate action)
2. Founder note (intent and perspective)
3. Waitlist conversion block
4. Why Toyb proof points
5. Audience framing
6. Preview/system framing

Copy principles per section:

- One primary claim per block.
- Support with 2-4 short lines, not long paragraphs.
- Keep CTA language consistent with user intent stage.

## 10) SEO and metadata consistency

Source:

- `src/layouts/BaseLayout.astro`

Baseline:

- Canonical URL
- Open Graph and Twitter metadata
- JSON-LD for `SoftwareApplication`

Rules:

- Titles and descriptions should match section promise, not generic templates.
- Keep OG image and canonical values explicit when needed.

## 11) Implementation governance

Edit locations by concern:

- Tokens: `src/styles/theme.css`
- Shared component styles: `src/styles/global.css`
- Layout shell/metadata: `src/layouts/BaseLayout.astro`
- Content components: `src/components/*.astro`
- Page-level copy: `src/pages/index.astro`

Change policy:

- If adding a visual primitive, add it to tokens or shared styles first.
- Do not duplicate style constants inside page files.
- Prefer incremental copy edits over large multi-section rewrites without review.

## 12) PR checklist (quick)

- Copy follows tone and system positioning.
- No new hardcoded colors/sizes outside tokens.
- Buttons and forms keep existing interaction/focus behavior.
- Mobile and desktop layouts validated.
- Reduced-motion behavior respected.
- Accessibility landmarks and labels preserved.

