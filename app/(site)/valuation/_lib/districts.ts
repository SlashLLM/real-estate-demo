/* Singapore postal district lookup (first two digits of the postal code → district 1–28) and an
 * indicative resale psf baseline per district.
 *
 * The baseline is only used when the live AI estimate is unavailable (no OPENAI_API_KEY, budget
 * spent, or an implausible answer). The UI labels it as a district-level estimate with low confidence.
 * Indicative 2026 levels; review them against recent URA caveats each quarter. */

const SECTOR_TO_DISTRICT: Record<string, number> = {};
const RANGES: [number, string[]][] = [
  [1, ["01", "02", "03", "04", "05", "06"]],
  [2, ["07", "08"]],
  [3, ["14", "15", "16"]],
  [4, ["09", "10"]],
  [5, ["11", "12", "13"]],
  [6, ["17"]],
  [7, ["18", "19"]],
  [8, ["20", "21"]],
  [9, ["22", "23"]],
  [10, ["24", "25", "26", "27"]],
  [11, ["28", "29", "30"]],
  [12, ["31", "32", "33"]],
  [13, ["34", "35", "36", "37"]],
  [14, ["38", "39", "40", "41"]],
  [15, ["42", "43", "44", "45"]],
  [16, ["46", "47", "48"]],
  [17, ["49", "50", "81"]],
  [18, ["51", "52"]],
  [19, ["53", "54", "55", "82"]],
  [20, ["56", "57"]],
  [21, ["58", "59"]],
  [22, ["60", "61", "62", "63", "64"]],
  [23, ["65", "66", "67", "68"]],
  [24, ["69", "70", "71"]],
  [25, ["72", "73"]],
  [26, ["77", "78"]],
  [27, ["75", "76"]],
  [28, ["79", "80"]],
];
for (const [d, sectors] of RANGES) for (const s of sectors) SECTOR_TO_DISTRICT[s] = d;

export function postalDistrict(postal: string): number | null {
  return SECTOR_TO_DISTRICT[postal.slice(0, 2)] ?? null;
}

/** Indicative resale condo psf (SGD) by district, 2026. */
const CONDO_PSF: Record<number, number> = {
  1: 2600, 2: 2400, 3: 2300, 4: 2300, 5: 1750, 6: 2700, 7: 2300, 8: 1900, 9: 2900, 10: 2700,
  11: 2400, 12: 1850, 13: 1850, 14: 1700, 15: 2000, 16: 1550, 17: 1350, 18: 1350, 19: 1500,
  20: 1700, 21: 1800, 22: 1500, 23: 1400, 24: 1300, 25: 1250, 26: 1500, 27: 1350, 28: 1450,
};

/** EC resale trades at a discount to private condos; landed is priced on land psf. */
const KIND_FACTOR = { condo: 1, ec: 0.78, landed: 0.95 } as const;

export function baselinePsf(district: number | null, kind: "condo" | "ec" | "landed") {
  const base = (district && CONDO_PSF[district]) || 1600;
  return Math.round(base * KIND_FACTOR[kind]);
}
