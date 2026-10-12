import "server-only";
import OpenAI from "openai";
import { DEFAULT_OPENAI_MODEL, MODEL_DAILY_BUDGET, PSF_BOUNDS } from "./config";
import { baselinePsf, postalDistrict } from "./districts";
import { consumeModelCall } from "./memory";
import type { Address, Comparable, Valuation } from "./types";

/* Condo / EC / landed valuation.
 *
 * Ported from SmartHomes' web-search-grounded estimate (api/_lib/openai-estimate.js): Strategy A is one
 * Responses call combining `web_search` with a strict json_schema; Strategy B researches in free text
 * and extracts with a tool-less call. Output is validated against PSF_BOUNDS and rejected, not shown,
 * when implausible. With no key, a spent budget or a rejected answer, the district psf baseline answers
 * instead and the UI says so. */

type Kind = "condo" | "ec" | "landed";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["estimatedPsf", "lowPsf", "highPsf", "confidence", "comparablesFound", "comparables", "sources", "rationale"],
  properties: {
    estimatedPsf: { type: "number", description: "Best estimate of current market value in SGD per sqft for this unit." },
    lowPsf: { type: "number", description: "Low end of a realistic range, SGD psf." },
    highPsf: { type: "number", description: "High end of a realistic range, SGD psf." },
    confidence: { type: "integer", description: "0-100. How well the comparables support the figures." },
    comparablesFound: { type: "integer", description: "Number of genuinely comparable transactions or listings used." },
    comparables: {
      type: "array",
      description: "Up to 6 comparables actually found.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "date", "price", "psf"],
        properties: {
          label: { type: "string", description: "Project and unit description, e.g. 'Same project, #12-xx, 1,033 sqft, 3BR'." },
          date: { type: "string", description: "Month of the transaction or listing, YYYY-MM." },
          price: { type: "number", description: "Price in SGD." },
          psf: { type: "number", description: "SGD per sqft." },
        },
      },
    },
    sources: { type: "array", items: { type: "string" }, description: "Hostnames actually consulted." },
    rationale: { type: "string", description: "One or two plain sentences. No URLs or markdown." },
  },
} as const;

const SYSTEM = `You are a Singapore residential property analyst producing indicative valuations for a licensed agent's public calculator.

Search current Singapore sources before answering: recent URA caveat transactions as reported by edgeprop.sg, srx.com.sg, 99.co, propertyguru.com.sg, and current asking prices.

Rules:
- Prefer transactions in the same project within the last 12 months, then nearby projects of similar age and tenure.
- Condo/EC figures are SGD per sqft of strata area. Landed figures are SGD per sqft of LAND area.
- Asking prices run above transacted prices; weight transactions more heavily.
- Account for floor level when given (higher floors usually command a premium in condos).
- Set confidence honestly; few or weak comparables mean a low number and a wider range.
- comparablesFound must be the real count you used. Report only hostnames you genuinely consulted.
- Return numbers only, no currency symbols or ranges inside number fields.`;

function prompt(address: Address, kind: Kind, area: number, storey?: number | null, bedrooms?: number | null) {
  return [
    `Address: ${address.address}`,
    address.building ? `Project / building: ${address.building}` : null,
    `Postal district: D${postalDistrict(address.postal) ?? "unknown"}`,
    `Property type: ${kind === "ec" ? "executive condominium (EC)" : kind}`,
    kind === "landed" ? `Land area: ${area} sqft` : `Strata area: ${area} sqft`,
    storey ? `Floor: ${storey}` : null,
    bedrooms ? `Bedrooms: ${bedrooms}` : null,
    "",
    "Estimate the current market value per sqft and a realistic range for this property.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function parseLoose(text?: string | null): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const s = candidate.indexOf("{");
    const e = candidate.lastIndexOf("}");
    if (s === -1 || e <= s) return null;
    try {
      return JSON.parse(candidate.slice(s, e + 1));
    } catch {
      return null;
    }
  }
}

const cleanText = (t: string) =>
  t
    .replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s*\(?\bhttps?:\/\/\S+/g, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

type AiEstimate = {
  psf: number;
  lowPsf: number;
  highPsf: number;
  confidence: number;
  comparablesFound: number;
  comparables: Comparable[];
  sources: string[];
  rationale: string;
};

function validate(raw: Record<string, unknown> | null, kind: Kind): AiEstimate | null {
  if (!raw) return null;
  const n = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.]/g, "")));
  const psf = n(raw.estimatedPsf);
  let lowPsf = n(raw.lowPsf);
  let highPsf = n(raw.highPsf);
  const b = PSF_BOUNDS[kind];
  if (![psf, lowPsf, highPsf].every(Number.isFinite)) return null;
  if (psf < b.min || psf > b.max) return null;
  // Keep the range honest: ordered, and no wider than ±20% around the estimate.
  lowPsf = Math.max(psf * 0.8, Math.min(lowPsf, psf));
  highPsf = Math.min(psf * 1.2, Math.max(highPsf, psf));
  if (highPsf - lowPsf < psf * 0.04) {
    lowPsf = psf * 0.97;
    highPsf = psf * 1.03;
  }
  const comps = Array.isArray(raw.comparables) ? (raw.comparables as Record<string, unknown>[]) : [];
  return {
    psf,
    lowPsf,
    highPsf,
    confidence: Math.max(0, Math.min(90, Math.round(n(raw.confidence) || 0))),
    comparablesFound: Math.max(0, Math.round(n(raw.comparablesFound) || 0)),
    comparables: comps.slice(0, 6).flatMap((c) => {
      const price = n(c.price);
      const cpsf = n(c.psf);
      if (!Number.isFinite(price) || price < 100_000) return [];
      return [{ month: String(c.date ?? "").slice(0, 7), label: cleanText(String(c.label ?? "")).slice(0, 120), detail: "", price, psf: Number.isFinite(cpsf) ? Math.round(cpsf) : null }];
    }),
    sources: Array.isArray(raw.sources) ? (raw.sources as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 8) : [],
    rationale: typeof raw.rationale === "string" ? cleanText(raw.rationale).slice(0, 600) : "",
  };
}

function sourcesFrom(response: { output?: unknown[] }) {
  const hosts = new Set<string>();
  const push = (u?: string) => {
    try {
      if (u) hosts.add(new URL(u).hostname.replace(/^www\./, ""));
    } catch {}
  };
  for (const item of (response.output ?? []) as Record<string, any>[]) {
    for (const s of item?.action?.sources ?? []) push(typeof s === "string" ? s : s?.url);
    for (const c of item?.content ?? []) for (const a of c?.annotations ?? []) if (a?.type === "url_citation") push(a.url);
  }
  return [...hosts];
}

async function askModel(text: string, kind: Kind, signal: AbortSignal): Promise<AiEstimate | null> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const format = { type: "json_schema" as const, name: "sg_property_valuation", schema: SCHEMA as unknown as Record<string, unknown>, strict: true };

  try {
    const r = await client.responses.create(
      { model, tools: [{ type: "web_search" }], text: { format }, input: [{ role: "system", content: SYSTEM }, { role: "user", content: text }] },
      { signal },
    );
    const parsed = validate(parseLoose(r.output_text), kind);
    if (parsed) {
      const searched = sourcesFrom(r as never);
      if (searched.length) parsed.sources = searched.slice(0, 8);
      return parsed;
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    console.warn("[valuation] single-call strategy failed:", (err as Error)?.message);
  }

  const research = await client.responses.create(
    {
      model,
      tools: [{ type: "web_search" }],
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${text}\n\nList the comparable transactions you found with dates, sizes and prices, then state your psf estimate and range.` },
      ],
    },
    { signal },
  );
  const extraction = await client.responses.create(
    {
      model,
      text: { format },
      input: [
        { role: "system", content: "Convert the analyst's findings into the required JSON. Use only figures present in the findings." },
        { role: "user", content: research.output_text || "" },
      ],
    },
    { signal },
  );
  const parsed = validate(parseLoose(extraction.output_text), kind);
  const searched = sourcesFrom(research as never);
  if (parsed && searched.length) parsed.sources = searched.slice(0, 8);
  return parsed;
}

const roundTo = (v: number) => Math.round(v / (v >= 1_000_000 ? 5000 : 1000)) * (v >= 1_000_000 ? 5000 : 1000);
const label = { condo: "condo", ec: "EC", landed: "landed home" } as const;

export async function valuePrivate(
  address: Address,
  kind: Kind,
  opts: { area: number; storey?: number | null; bedrooms?: number | null },
): Promise<Valuation> {
  const district = postalDistrict(address.postal);
  const name = address.building ? titleCase(address.building) : `${address.block} ${titleCase(address.road)}`.trim();
  const areaLabel = kind === "landed" ? `${opts.area.toLocaleString("en-SG")} sqft land` : `${opts.area.toLocaleString("en-SG")} sqft`;
  const subject = `${name} · ${label[kind]} · ${areaLabel}${opts.storey ? ` · floor ${opts.storey}` : ""}`;

  let ai: AiEstimate | null = null;
  let note = "";
  if (!process.env.OPENAI_API_KEY) note = "Live market search isn't switched on yet.";
  else if (!consumeModelCall(MODEL_DAILY_BUDGET)) note = "We've reached today's live-analysis limit.";
  else {
    try {
      ai = await askModel(prompt(address, kind, opts.area, opts.storey, opts.bedrooms), kind, AbortSignal.timeout(45_000));
      if (!ai) note = "The live market search didn't return figures we could stand behind.";
    } catch (err) {
      console.error("[valuation] model call failed:", (err as Error)?.message);
      note = "The live market search is unavailable right now.";
    }
  }

  const caveats = [
    "Indicative only, not a formal valuation. A bank valuation may differ.",
    "Does not account for renovation, facing, view, stack or exact unit position.",
    kind === "landed"
      ? "Landed values depend heavily on land size, tenure, plot shape and redevelopment potential."
      : "Tenure (freehold vs 99-year) and remaining lease can move value materially.",
  ];

  if (ai) {
    const mid = roundTo(ai.psf * opts.area);
    return {
      kind,
      address: address.address,
      subject,
      low: roundTo(ai.lowPsf * opts.area),
      mid,
      high: roundTo(ai.highPsf * opts.area),
      psf: Math.round(ai.psf),
      confidence: Math.max(40, Math.min(85, ai.confidence)),
      comparablesUsed: ai.comparablesFound,
      basis: `Based on a live search of ${ai.comparablesFound || "recent"} comparable ${label[kind]} transactions and listings${district ? ` around District ${district}` : ""}.`,
      method: "ai",
      sources: ai.sources,
      report: {
        comparables: ai.comparables,
        adjustments: [ai.rationale].filter(Boolean),
        trend: null,
        strategy: strategy(mid, roundTo(ai.lowPsf * opts.area), roundTo(ai.highPsf * opts.area)),
        caveats,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  if (note) console.info(`[valuation] baseline used: ${note}`);
  const psf = baselinePsf(district, kind);
  const mid = roundTo(psf * opts.area);
  const low = roundTo(mid * 0.88);
  const high = roundTo(mid * 1.12);
  return {
    kind,
    address: address.address,
    subject,
    low,
    mid,
    high,
    psf,
    confidence: 40,
    comparablesUsed: 0,
    basis: `A District ${district ?? "–"} market baseline for a ${label[kind]} of this size. Unlock the report and your agent will price it against actual transactions in your project.`,
    method: "baseline",
    sources: [],
    report: {
      comparables: [],
      adjustments: [`District ${district ?? "–"} indicative resale level of about $${psf.toLocaleString("en-SG")} psf applied to ${areaLabel}.`],
      trend: null,
      strategy: strategy(mid, low, high),
      caveats,
    },
    generatedAt: new Date().toISOString(),
  };
}

function strategy(mid: number, low: number, high: number) {
  return [
    `A realistic asking band is $${fmtK(mid)} to $${fmtK(high)}; recent buyers in this segment negotiate 2–5% off asking.`,
    `Below $${fmtK(low)} you're likely under the market. Get a project-level check before accepting.`,
    "Your agent will pull the latest URA caveats for your exact stack and floor before you list.",
  ];
}

const fmtK = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
