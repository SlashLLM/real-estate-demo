import "server-only";
import type { Address } from "./types";

/* OneMap (Singapore Land Authority) address search. Free; search works without a token, but an
 * ONEMAP_TOKEN is sent when configured so the integration survives OneMap tightening access. */

const ENDPOINT = "https://www.onemap.gov.sg/api/common/elastic/search";

type OneMapRow = {
  ADDRESS?: string;
  BLK_NO?: string;
  ROAD_NAME?: string;
  BUILDING?: string;
  POSTAL?: string;
  LATITUDE?: string;
  LONGITUDE?: string;
};

export async function searchAddresses(query: string): Promise<Address[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 3) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set("searchVal", q);
  url.searchParams.set("returnGeom", "Y");
  url.searchParams.set("getAddrDetails", "Y");
  url.searchParams.set("pageNum", "1");

  const res = await fetch(url, {
    headers: process.env.ONEMAP_TOKEN ? { Authorization: process.env.ONEMAP_TOKEN } : {},
    next: { revalidate: 60 * 60 * 24 * 7 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`OneMap ${res.status}`);
  const data = (await res.json()) as { results?: OneMapRow[] };

  const seen = new Set<string>();
  const out: Address[] = [];
  for (const r of data.results ?? []) {
    const postal = r.POSTAL && r.POSTAL !== "NIL" ? r.POSTAL : "";
    const road = r.ROAD_NAME && r.ROAD_NAME !== "NIL" ? r.ROAD_NAME : "";
    // A valuation needs a real, addressable building: skip bus stops, roads and parks.
    if (!postal || !road) continue;
    const key = `${postal}|${r.BLK_NO}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      address: r.ADDRESS ?? "",
      block: r.BLK_NO && r.BLK_NO !== "NIL" ? r.BLK_NO : "",
      road,
      building: r.BUILDING && r.BUILDING !== "NIL" ? r.BUILDING : "",
      postal,
      lat: r.LATITUDE ? Number(r.LATITUDE) : null,
      lng: r.LONGITUDE ? Number(r.LONGITUDE) : null,
    });
    if (out.length >= 6) break;
  }
  return out;
}
