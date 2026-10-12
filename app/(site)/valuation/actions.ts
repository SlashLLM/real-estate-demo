"use server";

import { headers } from "next/headers";
import { CACHE_TTL_MS, RATE_LIMIT } from "./_lib/config";
import { valueHdb } from "./_lib/hdb";
import { allow, cacheGet, cacheSet } from "./_lib/memory";
import { searchAddresses } from "./_lib/onemap";
import { placeDetails, placesAutocomplete, placesEnabled } from "./_lib/places";
import { valuePrivate } from "./_lib/private";
import { HDB_FLAT_TYPES, type Address, type Suggestion, type ValuationInput, type ValuationResult } from "./_lib/types";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Address suggestions: Google Places when GOOGLE_MAPS_API_KEY is set (as in SmartHomes), otherwise OneMap. */
export async function searchAddress(
  q: string,
  session?: string,
): Promise<{ ok: true; results: Suggestion[] } | { ok: false; error: string }> {
  if (typeof q !== "string" || q.trim().length < 3) return { ok: true, results: [] };
  if (!allow(`addr:${await clientIp()}`, RATE_LIMIT.address)) {
    return { ok: false, error: "Too many lookups. Please try again shortly." };
  }
  const token = typeof session === "string" && /^[\w-]{8,64}$/.test(session) ? session : undefined;
  try {
    if (placesEnabled()) return { ok: true, results: await placesAutocomplete(q, token) };
    const rows = await searchAddresses(q);
    return {
      ok: true,
      results: rows.map((a) => ({
        id: `${a.postal}-${a.block}`,
        primary: a.building ? titleCase(a.building) : `Blk ${a.block} ${titleCase(a.road)}`,
        secondary: `${a.building ? `${a.block} ${titleCase(a.road)} · ` : ""}Singapore ${a.postal}`,
        address: a,
      })),
    };
  } catch (err) {
    console.error("[valuation] address search failed:", (err as Error).message);
    return { ok: false, error: "Address search is unavailable right now. Try your 6-digit postal code." };
  }
}

/** Turns a picked Google suggestion into a full address (block, road, postal). Ends the Places billing session. */
export async function resolveAddress(placeId: string, session?: string): Promise<{ ok: true; address: Address } | { ok: false; error: string }> {
  if (typeof placeId !== "string" || !/^[\w-]{10,300}$/.test(placeId)) return { ok: false, error: "Pick your address from the suggestions." };
  if (!placesEnabled()) return { ok: false, error: "Address lookup isn't configured." };
  if (!allow(`addr:${await clientIp()}`, RATE_LIMIT.address)) {
    return { ok: false, error: "Too many lookups. Please try again shortly." };
  }
  const token = typeof session === "string" && /^[\w-]{8,64}$/.test(session) ? session : undefined;
  try {
    const address = await placeDetails(placeId, token);
    if (!/^\d{6}$/.test(address.postal) || !address.road) {
      return { ok: false, error: "That place doesn't have a full Singapore address. Try your block and street, or the postal code." };
    }
    return { ok: true, address };
  } catch (err) {
    console.error("[valuation] place details failed:", (err as Error).message);
    return { ok: false, error: "We couldn't look up that address just now. Please try again." };
  }
}

const titleCase = (s: string) => s.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const str = (v: unknown, max = 160) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function parse(input: ValuationInput): ValuationInput | string {
  const a = input?.address;
  const address: Address = {
    address: str(a?.address, 200),
    block: str(a?.block, 10),
    road: str(a?.road, 100),
    building: str(a?.building, 100),
    postal: str(a?.postal, 6),
    lat: num(a?.lat, 1, 2),
    lng: num(a?.lng, 103, 105),
  };
  if (!/^\d{6}$/.test(address.postal) || !address.road) return "Pick your address from the suggestions.";
  const kind = input.kind;
  if (!["hdb", "condo", "ec", "landed"].includes(kind)) return "Choose a property type.";

  if (kind === "hdb") {
    if (!HDB_FLAT_TYPES.includes(input.flatType as never)) return "Choose your flat type.";
    return { address, kind, flatType: input.flatType, area: num(input.area, 25, 300), storey: num(input.storey, 1, 60) };
  }
  const area = num(input.area, kind === "landed" ? 800 : 300, kind === "landed" ? 30000 : 12000);
  if (!area) return kind === "landed" ? "Enter the land area in sqft." : "Enter the floor area in sqft.";
  return { address, kind, area, storey: num(input.storey, 1, 80), bedrooms: num(input.bedrooms, 1, 8) };
}

export async function getValuation(raw: ValuationInput): Promise<ValuationResult> {
  const input = parse(raw);
  if (typeof input === "string") return { ok: false, error: input };

  const key = JSON.stringify([input.kind, input.address.postal, input.address.block, input.flatType, input.area, input.storey, input.bedrooms]);
  const cached = cacheGet<ValuationResult>(key);
  if (cached) return cached;

  if (!allow(`val:${await clientIp()}`, RATE_LIMIT.valuation)) {
    return { ok: false, error: "You've run a lot of valuations this hour. Please try again later, or call us." };
  }

  try {
    const valuation =
      input.kind === "hdb"
        ? await valueHdb(input.address, input.flatType!, { area: input.area, storey: input.storey })
        : await valuePrivate(input.address, input.kind, { area: input.area!, storey: input.storey, bedrooms: input.bedrooms });
    const result: ValuationResult = { ok: true, valuation };
    // A district baseline is cheap to recompute and should give way to a live answer once one is possible.
    if (valuation.method !== "baseline") cacheSet(key, result, input.kind === "hdb" ? CACHE_TTL_MS.hdb : CACHE_TTL_MS.ai);
    return result;
  } catch (err) {
    const msg = (err as Error).message || "";
    console.error("[valuation] failed:", msg);
    // Messages thrown deliberately by the engines are written for the visitor; anything else stays generic.
    const friendly = /^(Pick|We couldn't|Not enough)/.test(msg) ? msg : "We couldn't value that address just now. Please try again in a moment.";
    return { ok: false, error: friendly };
  }
}
