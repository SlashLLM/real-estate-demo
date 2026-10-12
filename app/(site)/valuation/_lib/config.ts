/* Valuation constants. These are the commercial assumptions behind every number the widget shows,
 * so they live in one place with an explanation, the same way SmartHomes' api/_lib/config.js does. */

/** data.gov.sg "Resale flat prices based on registration date from Jan-2017 onwards". */
export const HDB_RESALE_RESOURCE = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";

export const HDB = {
  // Comparable windows. Block/street sales older than this are ignored; town-level fallback is kept tighter.
  STREET_WINDOW_MONTHS: 24,
  TOWN_WINDOW_MONTHS: 12,
  // Fewer recent same-street sales than this and we widen to the whole town.
  MIN_STREET_COMPARABLES: 6,
  // Time adjustment applied to older sales: roughly 3.7% a year, a conservative read of the HDB
  // resale price index over 2024–26. Brings a sale from 18 months ago up to today's money.
  MONTHLY_GROWTH: 0.003,
  // Each floor above (below) a comparable adds (removes) this share of value, capped.
  STOREY_PER_FLOOR: 0.006,
  STOREY_CAP: 0.1,
  // Each year of remaining lease difference vs a comparable, capped. Only applied across blocks.
  LEASE_PER_YEAR: 0.008,
  LEASE_CAP: 0.15,
  // Range half-width as a share of the mid value, from the spread of adjusted comparables.
  MIN_SPREAD: 0.03,
  MAX_SPREAD: 0.12,
};

/* Default OpenAI model for condo / EC / landed estimates (engine ported from SmartHomes). Override with OPENAI_MODEL.
 * Must support the Responses API `web_search` tool AND strict structured outputs. gpt-6-luna was tested for both
 * (Oct 2026: ~7k input / ~250 output tokens per estimate incl. search). The web_search tool fee is billed per call on
 * top of tokens, so results are cached and capped by MODEL_DAILY_BUDGET. */
export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
export const MODEL_DAILY_BUDGET = Number(process.env.MODEL_DAILY_BUDGET) || 150;

/* Plausibility bounds for private-property psf (SGD per sqft). Anything outside is rejected, not shown. */
export const PSF_BOUNDS = {
  condo: { min: 500, max: 7500 },
  ec: { min: 500, max: 2500 },
  landed: { min: 500, max: 6000 }, // land psf
} as const;

export const CACHE_TTL_MS = {
  hdb: 12 * 60 * 60 * 1000,
  ai: 30 * 24 * 60 * 60 * 1000,
};

/* Per-IP budgets (in-process; per server instance). */
export const RATE_LIMIT = {
  valuation: { max: 20, windowMs: 60 * 60 * 1000 },
  address: { max: 400, windowMs: 60 * 60 * 1000 },
};
