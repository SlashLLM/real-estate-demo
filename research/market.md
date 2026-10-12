# Market research: Singapore home valuation + personal agent sites

No current website (new build). Research via wigolo `search` + `fetch`, 2026-10-09.

## Instant valuation tools (the lead magnet's competition)
| Who | What they do well | Gap PropertyPro AI can fill |
|---|---|---|
| **SRX X-Value** (srx.com.sg/xvalue-pricing) | The category anchor: "used to price 1.3M+ homes a year", HDB/condo/landed, powers 99.co's Property Value Tool. | Portal-owned; the lead goes to whichever agent buys it. No named person behind the number. |
| **99.co Property Value Tool** | Real-time value + 10-year trend + past transactions. | Same SRX engine, generic. |
| **PropertyGuru My Home** | Tracks home value over time; Condo & HDB. | Requires account; portal-centric. |
| **Cashew** (cashew.sg/home-valuation) | Best page studied: "Pop in your postal code and unit", sample result card shows range ($1.74M – $1.82M – $1.91M), psf, equity, "+$340k since purchase"; 3-step "how it works"; honest caveats ("does not account for cash over valuation, condition, or a bank's own assessment"); "No sign-up required". | Mortgage-broker funnel, not an agent. |

Takeaways we borrow: **postal code first** input, **range not a single number**, **psf / psm** alongside, show **the comparables**, an explicit **"what this does not include"** caveat, and a **3-step "how it works"**.
Differentiator: the number is free and instant, the **full report (comparables, lease decay, selling-price strategy) is unlocked by name/phone/email**, and a real agent follows up personally.

## Personal agent websites (website48.com, "Why Singapore Real Estate Agents Need Their Own Website in 2026")
- Agents relying on PropertyGuru / 99.co don't own the leads; a personal site does.
- Must-haves: personal brand story, **transaction track record** (district, type, value), **3–5 genuine testimonials with name + property type**, specialisation (HDB upgraders, condos, en bloc), market insights.
- Regulatory: CEA requires agent name, **CEA registration number** and the **agency's name + licence number** on advertising. These are placeholders until the client supplies them.

## Data sources verified (free, no key)
- **data.gov.sg HDB resale flat prices** (`resource_id d_8b84c4ee58e3cfc0ece0d773c8ca6abc`): transactions up to 2026-10, block / street / storey range / floor area / lease commencement / resale price. Powers the HDB valuation directly.
- **OneMap search** (`onemap.gov.sg/api/common/elastic/search`): postal code / block / building → address, lat/lng. Works without a token for search.
- Private (condo / EC / landed): no free official transaction API (URA needs an access key) → OpenAI `web_search` estimate ported from SmartHomes, validated against bounds, with a district psf baseline as fallback.

## Competitors for brief.competitors
SRX, 99.co, PropertyGuru, Cashew, EdgeProp, Ohmyhome.
