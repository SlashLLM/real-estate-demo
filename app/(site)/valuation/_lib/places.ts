import "server-only";
import { searchAddresses } from "./onemap";
import type { Address, Suggestion } from "./types";

/* Google Places (New) address lookup, ported from SmartHomes (api/places/autocomplete.js + details.js) and
 * restricted to Singapore. Proxied so GOOGLE_MAPS_API_KEY never reaches the browser.
 *
 * The browser makes one session token on the first keystroke, passes it on every autocomplete call and then to
 * details on selection. That keeps Places on session pricing instead of billing every keystroke.
 *
 * Singapore specifics: block numbers arrive as street_number, the road as route, and a condo or apartment
 * building's project name as displayName. A bare postal-code result carries no block or road, so those are filled
 * in from OneMap (the Singapore Land Authority's free address service). */

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS = "https://places.googleapis.com/v1/places/";

// Suggestions worth valuing: addresses, buildings and postal codes. Drops restaurants, shops, MRT stations, etc.
const ADDRESS_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "postal_code",
  "apartment_building",
  "apartment_complex",
  "condominium_complex",
  "housing_complex",
]);

export const placesEnabled = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);

export async function placesAutocomplete(input: string, session?: string): Promise<Suggestion[]> {
  const q = input.trim().slice(0, 80);
  // Cheap check first: a too-short query costs nothing.
  if (q.length < 3) return [];

  const res = await fetch(AUTOCOMPLETE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
    },
    body: JSON.stringify({ input: q, includedRegionCodes: ["sg"], ...(session ? { sessionToken: session } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error("[places/autocomplete] Google error", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error("places_failed");
  }
  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; types?: string[]; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[];
  };

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .filter((p) => (p.types ?? []).some((t) => ADDRESS_TYPES.has(t)))
    .map((p) => ({
      id: p.placeId,
      primary: p.structuredFormat?.mainText?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((p) => p.primary)
    .slice(0, 6);
}

type Component = { longText?: string; shortText?: string; types?: string[] };
const component = (parts: Component[] | undefined, type: string) => {
  const hit = (parts ?? []).find((c) => (c.types ?? []).includes(type));
  return hit?.longText || hit?.shortText || "";
};

export async function placeDetails(placeId: string, session?: string): Promise<Address> {
  const url = new URL(DETAILS + encodeURIComponent(placeId));
  if (session) url.searchParams.set("sessionToken", session);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location,displayName,types",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error("[places/details] Google error", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Error("places_failed");
  }
  const d = (await res.json()) as {
    formattedAddress?: string;
    addressComponents?: Component[];
    location?: { latitude?: number; longitude?: number };
    displayName?: { text?: string };
    types?: string[];
  };

  let block = component(d.addressComponents, "street_number");
  let road = component(d.addressComponents, "route");
  const postal = component(d.addressComponents, "postal_code");
  const name = d.displayName?.text ?? "";
  const types = d.types ?? [];
  // A project name (condo / apartment building), not a block label like "Block 406 HDB Ang Mo Kio" or "406 Ang Mo Kio Ave 10".
  const isProject =
    types.some((t) => ["condominium_complex", "apartment_building", "apartment_complex", "housing_complex", "premise", "establishment"].includes(t)) &&
    !/^\d/.test(name) &&
    !/^(block|blk)\b/i.test(name) &&
    !/\bHDB\b/i.test(name);
  let building = isProject ? name : component(d.addressComponents, "premise");

  // Postal-code results (and the odd building) come back without a block or road: fill them in from OneMap.
  if (postal && (!block || !road)) {
    const om = (await searchAddresses(postal).catch(() => [])).find((a) => a.postal === postal);
    if (om) {
      block ||= om.block;
      road ||= om.road;
      building ||= om.building;
    }
  }

  return {
    address: [block, road, postal ? `Singapore ${postal}` : ""].filter(Boolean).join(" ").toUpperCase() || (d.formattedAddress ?? "").toUpperCase(),
    block,
    road: road.toUpperCase(),
    building: building.toUpperCase(),
    postal,
    lat: d.location?.latitude ?? null,
    lng: d.location?.longitude ?? null,
  };
}
