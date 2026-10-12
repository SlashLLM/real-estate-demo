export type Address = {
  /** OneMap's full address, e.g. "406 ANG MO KIO AVENUE 10 SINGAPORE 560406". */
  address: string;
  block: string;
  road: string;
  /** Condo / building name, or "" for unnamed HDB blocks. */
  building: string;
  postal: string;
  lat: number | null;
  lng: number | null;
};

/** One address suggestion. Google results carry only an id until resolved; OneMap results carry the address. */
export type Suggestion = { id: string; primary: string; secondary: string; address?: Address };

export type PropertyKind = "hdb" | "condo" | "ec" | "landed";

export const HDB_FLAT_TYPES = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"] as const;
export type HdbFlatType = (typeof HDB_FLAT_TYPES)[number];

export type ValuationInput = {
  address: Address;
  kind: PropertyKind;
  /** HDB only. */
  flatType?: HdbFlatType;
  /** HDB: floor area in sqm (optional, inferred from the block's sales when blank).
   *  Condo / EC: strata area in sqft. Landed: land area in sqft. */
  area?: number | null;
  storey?: number | null;
  bedrooms?: number | null;
};

export type Comparable = {
  month: string; // "2026-09"
  label: string; // "Blk 415 Ang Mo Kio Ave 10" or a condo listing description
  detail: string; // "07–09 · 92 sqm · 1979 lease"
  price: number;
  psf: number | null;
};

export type Valuation = {
  kind: PropertyKind;
  address: string;
  /** "Blk 406 Ang Mo Kio Ave 10 · 4-room · 92 sqm" */
  subject: string;
  low: number;
  mid: number;
  high: number;
  psf: number | null;
  /** 0–100, how well the evidence supports the range. */
  confidence: number;
  comparablesUsed: number;
  /** Plain-English line on what the estimate rests on. */
  basis: string;
  /** "transactions" (HDB resale data), "ai" (live web search), "baseline" (district psf fallback). */
  method: "transactions" | "ai" | "baseline";
  sources: string[];
  /** Gated report detail. */
  report: {
    comparables: Comparable[];
    adjustments: string[];
    trend: string | null;
    strategy: string[];
    caveats: string[];
  };
  generatedAt: string;
};

export type ValuationResult = { ok: true; valuation: Valuation } | { ok: false; error: string };
