import "server-only";
import { HDB, HDB_RESALE_RESOURCE } from "./config";
import type { Address, Comparable, HdbFlatType, Valuation } from "./types";

/* HDB valuation from real resale transactions (data.gov.sg, Housing & Development Board).
 *
 *   1. Resolve the block's street as HDB writes it ("ANG MO KIO AVENUE 10" → "ANG MO KIO AVE 10").
 *   2. Pull recent sales of the same flat type on that street (one call). Widen to the town if thin.
 *   3. Bring each sale to today's money and to the subject's floor and lease.
 *   4. Weighted median $/sqm × floor area = mid; the spread of the adjusted sales sets the range.
 *
 * data.gov.sg rate-limits anonymous callers hard (a few requests a second), so a valuation makes one
 * to three calls, every call goes through Next's fetch cache, and 429s are retried with backoff.
 * Set DATA_GOV_SG_API_KEY to lift the limit. */

type Row = {
  month: string;
  town: string;
  flat_type: string;
  block: string;
  street_name: string;
  storey_range: string;
  floor_area_sqm: string;
  flat_model: string;
  lease_commence_date: string;
  remaining_lease: string;
  resale_price: string | number;
};

const API = "https://data.gov.sg/api/action/datastore_search";
const SQM_TO_SQFT = 10.7639;

async function query(filters: Record<string, string>, limit: number): Promise<Row[]> {
  const url = new URL(API);
  url.searchParams.set("resource_id", HDB_RESALE_RESOURCE);
  url.searchParams.set("filters", JSON.stringify(filters));
  url.searchParams.set("sort", "month desc");
  url.searchParams.set("limit", String(limit));

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: process.env.DATA_GOV_SG_API_KEY ? { "x-api-key": process.env.DATA_GOV_SG_API_KEY } : {},
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`data.gov.sg ${res.status}`);
    const body = (await res.json()) as { success?: boolean; result?: { records?: Row[] } };
    return body.result?.records ?? [];
  }
  throw new Error("data.gov.sg is busy");
}

/* HDB's street abbreviations. OneMap spells streets out; the resale dataset abbreviates them. */
const ABBREV: Record<string, string> = {
  AVENUE: "AVE", STREET: "ST", ROAD: "RD", DRIVE: "DR", CRESCENT: "CRES", CENTRAL: "CTRL",
  NORTH: "NTH", SOUTH: "STH", PLACE: "PL", CLOSE: "CL", TERRACE: "TER", LORONG: "LOR",
  BUKIT: "BT", JALAN: "JLN", UPPER: "UPP", KAMPONG: "KG", TANJONG: "TG", HEIGHTS: "HTS",
  GARDENS: "GDNS", PARK: "PK", MARKET: "MKT", COMMONWEALTH: "C'WEALTH", SAINT: "ST.",
};

export function hdbStreet(road: string) {
  return road
    .toUpperCase()
    .split(/\s+/)
    .map((w) => ABBREV[w] ?? w)
    .join(" ");
}

const tokens = (s: string) => new Set(hdbStreet(s).split(/\s+/).filter(Boolean));
function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size, 1);
}

/* Words that say nothing about where a street is. */
const GENERIC = new Set(["AVE", "ST", "RD", "DR", "CRES", "CTRL", "NTH", "STH", "PL", "CL", "TER", "LOR", "JLN", "UPP", "HTS", "GDNS", "PK", "MKT", "WALK", "WAY", "LINK", "VIEW", "RING", "LANE", "EAST", "WEST"]);
function distinctiveMatch(a: string, b: string) {
  const da = [...tokens(a)].filter((t) => !GENERIC.has(t) && !/^\d+[A-Z]?$/.test(t));
  const tb = tokens(b);
  return da.length > 0 && da.every((t) => tb.has(t));
}

const storeyMid = (range: string) => {
  const [lo, hi] = range.split(/\s+TO\s+/).map(Number);
  return Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : null;
};
const monthsAgo = (month: string, now = new Date()) => {
  const [y, m] = month.split("-").map(Number);
  return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
};
const price = (r: Row) => Number(r.resale_price);
const area = (r: Row) => Number(r.floor_area_sqm);

function weightedQuantile(values: { v: number; w: number }[], q: number) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total * q) return x.v;
  }
  return sorted[sorted.length - 1]?.v ?? 0;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const title = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/C'wealth/g, "C'wealth");

const roundTo = (n: number) => {
  const step = n >= 1_000_000 ? 5000 : 1000;
  return Math.round(n / step) * step;
};

export async function valueHdb(
  address: Address,
  flatType: HdbFlatType,
  opts: { area?: number | null; storey?: number | null },
): Promise<Valuation> {
  if (!address.block) throw new Error("Pick an HDB block address (with a block number) from the suggestions.");
  const now = new Date();
  const fresh = (r: Row, window: number) => monthsAgo(r.month, now) <= window;

  // 1 + 2. Same street, same flat type.
  let street = hdbStreet(address.road);
  let streetRows = await query({ street_name: street, flat_type: flatType }, 300);

  if (!streetRows.length) {
    // The abbreviation guess missed (or nobody on this street sold this type lately): look the block number up
    // and take the street that matches OneMap's. Block numbers repeat across towns, so the street must match
    // on its distinctive words (town names), not just on "ST 21".
    const blockRows = await query({ block: address.block }, 1000);
    const best = blockRows
      .map((r) => ({ r, s: similarity(r.street_name, address.road) }))
      .filter((x) => distinctiveMatch(x.r.street_name, address.road))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < 0.75) {
      throw new Error("We couldn't find HDB resale records for this block. If it's a condo or EC, switch the property type.");
    }
    street = best.r.street_name;
    streetRows = await query({ street_name: street, flat_type: flatType }, 300);
    if (!streetRows.length) {
      throw new Error(`Not enough recent ${flatType.toLowerCase()} resale transactions near this block to value it. Check the flat type, or ask us for a manual valuation.`);
    }
  }

  const sameBlock = streetRows.filter((r) => r.block === address.block);
  const town = streetRows[0]?.town ?? null;
  let subjectLease = median(sameBlock.map((r) => Number(r.lease_commence_date)).filter(Boolean));
  if (!subjectLease) {
    // No recent sales of this flat type in the block: any flat type in the same block shares its lease.
    const anyType = await query({ block: address.block, street_name: street }, 5).catch(() => []);
    subjectLease = median(anyType.map((r) => Number(r.lease_commence_date)).filter(Boolean));
  }
  const subjectArea =
    opts.area && opts.area >= 25 && opts.area <= 300
      ? opts.area
      : median(sameBlock.map(area)) ?? median(streetRows.map(area));

  type Comp = { r: Row; tier: 1 | 2 | 3 };
  let comps: Comp[] = streetRows
    .filter((r) => fresh(r, HDB.STREET_WINDOW_MONTHS))
    .map((r) => ({ r, tier: r.block === address.block ? 1 : 2 }));

  if (comps.length < HDB.MIN_STREET_COMPARABLES && town) {
    const townRows = await query({ town, flat_type: flatType }, 300);
    const extra = townRows
      .filter((r) => r.street_name !== street && fresh(r, HDB.TOWN_WINDOW_MONTHS))
      // Similar-age blocks only, so the lease adjustment stays small.
      .filter((r) => !subjectLease || Math.abs(Number(r.lease_commence_date) - subjectLease) <= 12)
      .slice(0, 60)
      .map((r) => ({ r, tier: 3 as const }));
    comps = comps.concat(extra);
  }

  if (!comps.length || !subjectArea) {
    throw new Error(`Not enough recent ${flatType.toLowerCase()} resale transactions near this block to value it. Check the flat type, or ask us for a manual valuation.`);
  }

  // 3. Adjust each sale to the subject.
  const adjusted = comps.map(({ r, tier }) => {
    const age = Math.max(0, monthsAgo(r.month, now));
    let factor = Math.pow(1 + HDB.MONTHLY_GROWTH, age);
    const mid = storeyMid(r.storey_range);
    if (opts.storey && mid) {
      const s = Math.max(-HDB.STOREY_CAP, Math.min(HDB.STOREY_CAP, (opts.storey - mid) * HDB.STOREY_PER_FLOOR));
      factor *= 1 + s;
    }
    if (tier !== 1 && subjectLease && r.lease_commence_date) {
      const l = Math.max(
        -HDB.LEASE_CAP,
        Math.min(HDB.LEASE_CAP, (subjectLease - Number(r.lease_commence_date)) * HDB.LEASE_PER_YEAR),
      );
      factor *= 1 + l;
    }
    const psm = (price(r) / area(r)) * factor;
    const weight = (tier === 1 ? 3 : tier === 2 ? 2 : 1) * Math.exp(-age / 12);
    return { r, tier, age, psm, weight };
  });

  // 4. Mid and range.
  const pts = adjusted.map((a) => ({ v: a.psm, w: a.weight }));
  const psmMid = weightedQuantile(pts, 0.5);
  const p25 = weightedQuantile(pts, 0.25);
  const p75 = weightedQuantile(pts, 0.75);
  const spread = Math.min(HDB.MAX_SPREAD, Math.max(HDB.MIN_SPREAD, (p75 - p25) / 2 / psmMid));
  const mid = roundTo(psmMid * subjectArea);
  const low = roundTo(mid * (1 - spread));
  const high = roundTo(mid * (1 + spread));

  const t1 = adjusted.filter((a) => a.tier === 1).length;
  const t2 = adjusted.filter((a) => a.tier === 2).length;
  const t3 = adjusted.filter((a) => a.tier === 3).length;
  let confidence = t1 >= 3 ? 84 : t1 + t2 >= 6 ? 76 : t1 + t2 >= 3 ? 66 : 56;
  confidence += Math.min(8, Math.floor(adjusted.length / 4));
  confidence -= Math.round((spread - HDB.MIN_SPREAD) * 100);
  if (!opts.area) confidence -= 4;
  confidence = Math.max(35, Math.min(92, confidence));

  const months = adjusted.map((a) => a.r.month).sort();
  const span = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });
  const where = t3 ? `${title(street)} and similar-age blocks in ${title(town ?? "")}` : title(street);

  // Trend: last 6 months vs the 6 before, on raw $/sqm (no time adjustment), when both halves have data.
  const recent = adjusted.filter((a) => a.age <= 6).map((a) => price(a.r) / area(a.r));
  const prior = adjusted.filter((a) => a.age > 6 && a.age <= 12).map((a) => price(a.r) / area(a.r));
  const mr = median(recent);
  const mp = median(prior);
  const trend =
    mr && mp && recent.length >= 3 && prior.length >= 3
      ? `${flatType.toLowerCase()} prices around ${title(street)} are ${mr >= mp ? "up" : "down"} ${Math.abs(((mr - mp) / mp) * 100).toFixed(1)}% on a $/sqm basis versus the previous six months (${recent.length} vs ${prior.length} sales).`
      : null;

  const comparables: Comparable[] = adjusted
    .sort((a, b) => a.tier - b.tier || a.age - b.age)
    .slice(0, 10)
    .map(({ r }) => ({
      month: r.month,
      label: `Blk ${r.block} ${title(r.street_name)}`,
      detail: `Storey ${r.storey_range.replace(" TO ", "–")} · ${Math.round(area(r))} sqm · ${r.flat_model} · lease from ${r.lease_commence_date}`,
      price: price(r),
      psf: Math.round(price(r) / (area(r) * SQM_TO_SQFT)),
    }));

  const remaining = subjectLease ? 99 - (now.getUTCFullYear() - subjectLease) : null;
  const adjustments = [
    `Older sales brought to today's money at ${(HDB.MONTHLY_GROWTH * 1200).toFixed(1)}% a year.`,
    opts.storey
      ? `Adjusted to storey ${opts.storey} at ${(HDB.STOREY_PER_FLOOR * 100).toFixed(1)}% per floor (capped at ±${HDB.STOREY_CAP * 100}%).`
      : "Floor level not given, so comparables are used at their own floor. Add your storey for a tighter range.",
    subjectLease
      ? `Lease from ${subjectLease} (about ${remaining} years left); other blocks adjusted ${(HDB.LEASE_PER_YEAR * 100).toFixed(1)}% per year of lease difference.`
      : "Lease commencement not found for this block, so no lease adjustment was applied.",
    opts.area
      ? `Valued on your floor area of ${opts.area} sqm (${Math.round(opts.area * SQM_TO_SQFT)} sqft).`
      : `Floor area not given; used the typical ${Math.round(subjectArea)} sqm for this flat type on your block or street.`,
  ];

  return {
    kind: "hdb",
    address: address.address,
    subject: `Blk ${address.block} ${title(address.road)} · ${flatType.toLowerCase().replace(" room", "-room")} · ${Math.round(subjectArea)} sqm`,
    low,
    mid,
    high,
    psf: Math.round(psmMid / SQM_TO_SQFT),
    confidence,
    comparablesUsed: adjusted.length,
    basis: `Based on ${adjusted.length} HDB resale transaction${adjusted.length === 1 ? "" : "s"}${t1 ? ` (${t1} in your block)` : ""} on ${where}, ${span(months[0])} to ${span(months[months.length - 1])}.`,
    method: "transactions",
    sources: ["data.gov.sg (HDB resale prices)"],
    report: {
      comparables,
      adjustments,
      trend,
      strategy: [
        `List around $${Math.round(high / 1000)}k to leave room to negotiate; serious offers should land near $${Math.round(mid / 1000)}k.`,
        `Treat $${Math.round(low / 1000)}k as your floor: below it, recent sales on ${title(street)} say you're leaving money on the table.`,
        "Ask buyers for their HDB valuation request early: the bank or HDB valuation, not the asking price, decides how much cash over valuation (COV) they must pay.",
      ],
      caveats: [
        "Indicative only, not a formal valuation. A bank or HDB valuation may differ.",
        "Does not account for renovation, condition, facing, view or exact unit position.",
        "Cash over valuation (COV) and the buyer's financing are not included.",
      ],
    },
    generatedAt: now.toISOString(),
  };
}

/** Latest HDB resales across Singapore, for the "Just transacted" ledger. */
export async function latestResales(limit = 8) {
  const url = new URL(API);
  url.searchParams.set("resource_id", HDB_RESALE_RESOURCE);
  url.searchParams.set("sort", "month desc,_id desc");
  // The newest records arrive grouped by town and flat type (largest types last), so take a wide slice and pick
  // one sale per town while rotating through the common flat types; otherwise the strip is all Executive flats.
  url.searchParams.set("limit", "2000");
  try {
    const res = await fetch(url, {
      headers: process.env.DATA_GOV_SG_API_KEY ? { "x-api-key": process.env.DATA_GOV_SG_API_KEY } : {},
      next: { revalidate: 60 * 60 * 6 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { result?: { records?: Row[] } };
    const rotation = ["4 ROOM", "3 ROOM", "5 ROOM"];
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const r of body.result?.records ?? []) {
      if (rows.length >= limit) break;
      if (seen.has(r.town) || r.flat_type !== rotation[rows.length % rotation.length]) continue;
      seen.add(r.town);
      rows.push(r);
    }
    return rows.map((r) => ({
      month: r.month,
      town: title(r.town),
      address: `Blk ${r.block} ${title(r.street_name)}`,
      flatType: title(r.flat_type),
      storey: r.storey_range.replace(" TO ", "–"),
      sqm: Math.round(area(r)),
      price: price(r),
    }));
  } catch {
    return [];
  }
}
