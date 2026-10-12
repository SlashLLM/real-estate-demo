# PropertyPro AI: design brief

> **v2 (current): "clear sky".** Light only. White-to-pale-sky haze with soft corner washes, a centered Instrument Serif
> headline (Arcway, `arcway-ai`), white cards with soft blue shadows over pale washes (Daybridge, `daybridge-com--pricing`), and small
> floating fact chips beside the valuation card (Bevel, `bevel-health--about-us`). Pill labels replace mono kickers; one lime highlight
> (`#E3EC9A`) is used for marks and avatars.
>
> | token | value | | token | value |
> |---|---|---|---|---|
> | bg / surface | `#FFFFFF` | | primary | `#2453C4` (6.75:1 on white) |
> | surface-2 | `#F4F7FC` | | primary-fg | `#FFFFFF` |
> | border | `#E4EAF4` | | lime (highlight) | `#E3EC9A` |
> | fg | `#15213B` (16:1) | | danger | `#B42318` |
> | muted | `#5A6782` (5.7:1) | | radius | 16px (cards 20px) |
>
> Type: Instrument Serif (display, prices), Inter (body), IBM Plex Mono (tiny data labels). Agent and contact details are demo
> content (Rachel Lim, PropertyPro Realty) to be replaced before launch. The v1 notes below are kept for history.

## Direction
**A valuation ledger on warm paper.** Cream stock, deep garden-green ink, one terracotta accent reserved for the numbers that matter.
Serif numerals are the hero: hairline rules and mono data labels make it read like a well-kept ledger. There's no stock photography; the proof is
live HDB transactions from data.gov.sg.

## References (Inspo)
| Screen | What we borrow | Where |
|---|---|---|
| `later-com` (split-studio) | Split hero: text column left ~55%, the "product" (here the valuation card) right ~45%; sentence-case headline, one solid primary + one outline secondary. | Home hero, Valuation hero |
| `menkind-co--haarverlies` | Cream paper (#fdfaf5 band), hairline rule above the headline, **thin-rule stat strip** under the hero, asymmetric balance of big serif headline vs small right-aligned copy. | "Just transacted" ledger strip, page heros on Sell/Buy/About |
| `nordiskamuseet-se` | A single short accent rule as a section divider; generous centered breathing room for closing CTAs. | Closing CTA bands |
| `albacross-com` | Product UI as the hero visual, with microcopy under the CTA ("No sign-up needed for the estimate"). | Valuation card microcopy |
| Cashew (research, not Inspo) | Postal-code-first input, **range not a point**, psf alongside, 3-step how-it-works, an explicit "what this doesn't include" caveat. | Valuation widget + methodology |

Taken from the references: composition only. Their low-contrast microtype is not copied.

## Tokens
| token | light | dark | `--tw-*` |
|---|---|---|---|
| bg | `#FBF8F2` | `#0F1714` | `--tw-bg` |
| surface | `#FFFFFF` | `#16201C` | `--tw-surface` |
| surface-2 | `#F3EEE4` | `#1E2A25` | `--tw-surface-2` |
| border | `#E4DCCD` | `#2C3A34` | `--tw-border` |
| fg | `#14211C` | `#ECE7DC` | `--tw-fg` |
| muted | `#56615B` | `#A3ADA6` | `--tw-muted` |
| primary | `#1F4D3F` | `#7FC4A6` | `--tw-primary` |
| primary-fg | `#FFFFFF` | `#0B1310` | `--tw-primary-fg` |
| accent | `#B04A22` (text-safe) | `#E9875D` | site-only `--pp-accent` |
| radius | 14px | 14px | `--tw-radius` |

Contrast: fg/bg ≈ 15.6:1; muted/bg ≈ 6.1:1; primary/white ≈ 9.9:1; accent `#B04A22`/bg ≈ 5.3:1 (safe for body text); dark muted/bg ≈ 7.6:1.
The admin area (`/admin`) inherits all `--tw-*`, so the CRM and social manager wear the same green-on-cream.

## Type
- Display: **Fraunces** (opsz, 500/600), tabular lining numerals for prices. Body: **Inter** 400/500/600. Data labels: **IBM Plex Mono** 500, uppercase, +0.08em tracking.
- Scale: 13 / 15 / 17 (body) / 20 / 28 / 40 / 56 (h1 desktop; 38 on mobile). Display tracking -0.02em.

## Layout
- Max width 1200px, `padding-inline: 20px` (mobile) / 32px; section rhythm `clamp(72px, 10vw, 128px)` on every seam.
- 12-col grid; hero 7/5 split on ≥1024px. On mobile the valuation card comes **directly after the headline and one line of copy**,
  before the proof bullets, so the tool is within the first scroll.
- Cards: 1px border, radius 14, white surface, no heavy shadows (one soft shadow on the valuation card only).

## Motion
Subtle. Hero headline and card fade/rise once on load; valuation loader runs a 3-step progress with a bar; result numbers count up.
Hover: button darken + 2px arrow nudge. Everything is off under `prefers-reduced-motion`.

## Pages

### Home `/`
1. **Hero (split)**: h1 "What's your home worth today?", sub, 3 proof bullets, secondary CTA `home-hero-book-call`. Right: **ValuationWidget** `home-hero-valuation`. *(later-com)*
2. **Just transacted**: live ledger of the latest HDB resales (data.gov.sg, revalidated every 6 h): month, block/street, type, storey, price. *(menkind stat-strip)*
3. **How it works**: 3 numbered steps. *(Cashew)*
4. **What's in your full report**: 4 cells (comparable sales, lease & floor adjustments, pricing strategy, next-move maths).
5. **Your agent**: personal intro card (agent name, CEA reg., agency, licence are `[[TO CONFIRM]]`), principles. CTA `home-sell-plan`.
6. **Sell · Buy · Upgrade**: three service rows linking to /sell, /buy.
7. **FAQ**: accuracy, COV, lease decay, PDPA.
8. **Closing band**: `home-closing-valuation`. *(nordiskamuseet)*

### Free valuation `/valuation`
Hero + **ValuationWidget** `valuation-tool-report` → Methodology (sources, adjustments, limits) → FAQ → closing `valuation-closing-call`.

### Sell `/sell`
Hero (`sell-hero-appraisal`) → 5-step selling process → what's included → inline form `sell-inline-plan` → closing `sell-closing-valuation`.

### Buy `/buy`
Hero (`buy-hero-shortlist`) → how I help (budget/loan check, shortlist priced against transactions, negotiation, paperwork) → inline form `buy-inline-brief`.

### About `/about`
Agent story (placeholders), credentials, how I work, testimonials placeholder → closing `about-closing-call`.

### Contact `/contact`
Heading tailored to `?cta=` → LeadCaptureForm → direct contact + hours.

## CTA inventory
| id | page | label | type |
|---|---|---|---|
| header-primary | all (header) | Free valuation | link → /valuation |
| home-hero-valuation | Home | Unlock my full report | inline (valuation widget → CRM) |
| home-hero-book-call | Home | Talk to an agent | link → /contact |
| home-sell-plan | Home | Get my selling plan | link → /contact |
| home-closing-valuation | Home | Value my home now | link → /valuation |
| valuation-tool-report | Valuation | Unlock my full report | inline (valuation widget → CRM) |
| valuation-closing-call | Valuation | Book a pricing consultation | link → /contact |
| sell-hero-appraisal | Sell | Book a home appraisal | link → /contact |
| sell-inline-plan | Sell | Send me my selling plan | inline LeadCaptureForm |
| sell-closing-valuation | Sell | Start with a free valuation | link → /valuation |
| buy-hero-shortlist | Buy | Get a shortlist | link → /contact |
| buy-inline-brief | Buy | Send me matching homes | inline LeadCaptureForm |
| about-closing-call | About | Book a 15-minute call | link → /contact |
| footer-contact | all (footer) | Speak to your agent | link → /contact |
| footer-valuation | all (footer) | Free home valuation | link → /valuation |

The valuation widget posts to the same CRM intake (`/api/crm/forms/<id>/submit`) with `first_name` (full name), `phone`, `email`,
`message` (address, property, estimate range, PDPA consent) and `_cta`. A `?cta=` on the page URL (e.g. from `header-primary`) wins over the widget's own id.
