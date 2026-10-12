"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getValuation, resolveAddress, searchAddress } from "@/app/(site)/valuation/actions";
import { HDB_FLAT_TYPES, type Address, type HdbFlatType, type PropertyKind, type Suggestion, type Valuation } from "@/app/(site)/valuation/_lib/types";

/*
 * The "Get a Free Instant Home Valuation" lead magnet, a Singapore port of SmartHomes' hero calculator:
 *   address (OneMap) → property details → staged analysis → range, psf and confidence (free)
 *   → full report (comparables, adjustments, pricing strategy) unlocked by name / mobile / email,
 *     which posts to the CRM intake with this widget's CTA id.
 */

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-SG");
const short = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
const KINDS: { id: PropertyKind; label: string }[] = [
  { id: "hdb", label: "HDB" },
  { id: "condo", label: "Condo" },
  { id: "ec", label: "EC" },
  { id: "landed", label: "Landed" },
];
const FLAT_LABEL: Record<HdbFlatType, string> = {
  "2 ROOM": "2-room",
  "3 ROOM": "3-room",
  "4 ROOM": "4-room",
  "5 ROOM": "5-room",
  EXECUTIVE: "Executive",
};
const METHOD_LABEL = {
  transactions: "Real HDB resale transactions",
  ai: "Live market search",
  baseline: "District baseline",
} as const;

export function ValuationWidget({
  cta,
  submitLabel = "Unlock my full report",
  formId,
  headingLevel = "h2",
  compact = false,
}: {
  cta: string;
  submitLabel?: string;
  formId?: string;
  headingLevel?: "h2" | "h3";
  /** Hero mode: tighter spacing, one-row details and no visible title, so the whole form fits above the fold. */
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const H = headingLevel;
  const Sub = headingLevel === "h2" ? "h3" : "h4";

  // address
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [addrHint, setAddrHint] = useState("");
  const [address, setAddress] = useState<Address | null>(null);
  const seq = useRef(0);
  // Google Places session token: one per typing session, retired by the details lookup (keeps Places on session pricing).
  const session = useRef<string | null>(null);

  // property
  const [kind, setKind] = useState<PropertyKind>("hdb");
  const [flatType, setFlatType] = useState<HdbFlatType>("4 ROOM");
  const [area, setArea] = useState("");
  const [storey, setStorey] = useState("");
  const [bedrooms, setBedrooms] = useState("");

  // analysis
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [valuation, setValuation] = useState<Valuation | null>(null);

  // lead gate
  const [lead, setLead] = useState<"locked" | "sending" | "unlocked">("locked");
  const [leadError, setLeadError] = useState("");
  const [leadName, setLeadName] = useState("");

  // Debounced address search (Google Places, or OneMap without a key); a sequence number drops out-of-order replies.
  useEffect(() => {
    if (address && query === address.address) return;
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      if (!session.current) session.current = crypto.randomUUID();
      const res = await searchAddress(q, session.current);
      if (n !== seq.current) return;
      if (!res.ok) {
        setAddrHint(res.error);
        setOpen(false);
        return;
      }
      setAddrHint(res.results.length ? "" : "No matching Singapore addresses. Try the 6-digit postal code.");
      setSuggestions(res.results);
      setActive(-1);
      setOpen(res.results.length > 0);
    }, 250);
    return () => clearTimeout(t);
  }, [query, address]);

  /** A Google suggestion is only an id: resolve it to block, road and postal code before valuing. */
  async function choose(s: Suggestion) {
    setOpen(false);
    if (s.address) return pick(s.address);
    setQuery([s.primary, s.secondary].filter(Boolean).join(", "));
    setResolving(true);
    setAddrHint("");
    const res = await resolveAddress(s.id, session.current ?? undefined);
    session.current = null;
    setResolving(false);
    if (res.ok) pick(res.address);
    else setAddrHint(res.error);
  }

  function pick(a: Address) {
    setAddress(a);
    setQuery(a.address);
    setOpen(false);
    setAddrHint("");
    // Unnamed blocks are almost always HDB; named buildings are usually private. The visitor can change it.
    const looksHdb = !a.building || /\bHDB\b/i.test(a.building);
    setKind((k) => (looksHdb ? "hdb" : k === "hdb" ? "condo" : k));
  }

  function onAddrKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const steps =
    kind === "hdb"
      ? [
          `Finding recent resale transactions${address?.block ? ` near Blk ${address.block}` : ""}…`,
          "Adjusting for floor, lease and size…",
          "Calculating your price range…",
        ]
      : [
          `Searching recent transactions${address?.building ? ` at ${titleCase(address.building)}` : " nearby"}…`,
          "Comparing size, floor and tenure…",
          "Calculating your price range…",
        ];

  const needsArea = kind !== "hdb";
  const canRun = !!address && !resolving && (!needsArea || Number(area) > 0) && status !== "loading";

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!address) {
      setAddrHint("Pick your address from the suggestions.");
      return;
    }
    setStatus("loading");
    setError("");
    setStep(0);
    setLead("locked");
    const timers = [setTimeout(() => setStep(1), 1400), setTimeout(() => setStep(2), 3000)];
    const res = await getValuation({
      address,
      kind,
      flatType: kind === "hdb" ? flatType : undefined,
      area: area ? Number(area) : null,
      storey: storey ? Number(storey) : null,
      bedrooms: bedrooms ? Number(bedrooms) : null,
    });
    timers.forEach(clearTimeout);
    if (res.ok) {
      setValuation(res.valuation);
      setStatus("done");
    } else {
      setError(res.error);
      setStatus("error");
    }
  }

  async function unlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valuation) return;
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const consent = data.get("consent") === "on";
    if (!name) return setLeadError("Please enter your name.");
    if (phone.replace(/\D/g, "").length < 8) return setLeadError("Please enter a valid mobile number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setLeadError("Please enter a valid email address.");
    if (!consent) return setLeadError("Please agree to be contacted about your valuation.");
    if (!formId) return setLeadError("We couldn't send your details just now. Please call or email us instead.");

    setLead("sending");
    setLeadError("");
    // A CTA that brought the visitor here (e.g. ?cta=header-primary) wins over this widget's own id.
    const pageCta = new URLSearchParams(window.location.search).get("cta");
    const message = [
      "Instant home valuation request",
      `Address: ${valuation.address}`,
      `Property: ${valuation.subject}`,
      `Estimate: ${fmt(valuation.low)} – ${fmt(valuation.high)} (most likely ${fmt(valuation.mid)})${valuation.psf ? `, ~${fmt(valuation.psf)} psf` : ""}`,
      `Confidence: ${valuation.confidence}% · ${METHOD_LABEL[valuation.method]} · ${valuation.comparablesUsed} comparables`,
      `Basis: ${valuation.basis}`,
      `PDPA consent to be contacted: yes (${new Date().toISOString()})`,
    ].join("\n");

    try {
      const res = await fetch(`/api/crm/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: name,
          phone,
          email,
          message,
          _cta: pageCta || cta,
          _page: window.location.href,
          _hp: String(data.get("_hp") ?? ""),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "failed");
      setLeadName(name.split(" ")[0]);
      setLead("unlocked");
    } catch {
      setLead("locked");
      setLeadError("We couldn't send your details just now. Please try again, or call us.");
    }
  }

  function reset() {
    setStatus("idle");
    setValuation(null);
    setLead("locked");
    setLeadError("");
  }

  const listId = `addr-list-${uid}`;

  return (
    <div className={`card rounded-[28px] bg-white/95 text-left backdrop-blur ${compact ? "p-4 sm:p-6" : "p-5 sm:p-8"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="caps whitespace-nowrap text-[11.5px] text-primary">Instant valuation</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-highlight/70 px-3 py-0.5 text-[11.5px] font-bold">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden /> Live market data
        </span>
      </div>
      <H className={compact ? "mt-1.5 text-[21px] font-extrabold tracking-tight [@media(max-height:700px)]:sr-only" : "display mt-2 text-[26px] sm:text-[28px]"}>What is your home worth?</H>

      {status !== "done" && (
        <form className={`grid ${compact ? "mt-3 gap-3" : "mt-5 gap-4"}`} onSubmit={run} noValidate>
          {/* Address */}
          <div className="relative">
            <label className="field-label" htmlFor={`addr-${uid}`}>
              Postal code or address
            </label>
            <input
              id={`addr-${uid}`}
              className="field"
              type="text"
              inputMode="search"
              autoComplete="off"
              placeholder="e.g. 560406 or Blk 406 Ang Mo Kio"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (address) setAddress(null);
              }}
              onKeyDown={onAddrKey}
              onFocus={() => suggestions.length && !address && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && (
              <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.id}-${i}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`cursor-pointer px-3.5 py-2.5 text-sm ${i === active ? "bg-surface-2" : "hover:bg-surface-2"}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(s);
                    }}
                  >
                    <strong className="block font-semibold">{s.primary}</strong>
                    <span className="text-muted">{s.secondary}</span>
                  </li>
                ))}
              </ul>
            )}
            {resolving && <p className="mt-1.5 text-[13.5px] text-muted">Looking up that address…</p>}
            {addrHint && <p className="mt-1.5 text-[13.5px] text-danger">{addrHint}</p>}
          </div>

          {/* Type */}
          <div>
            <span className="field-label" id={`kind-${uid}`}>
              Property type
            </span>
            <div className="seg" role="group" aria-labelledby={`kind-${uid}`}>
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {kind === "hdb" ? (
            <div className={`grid gap-3 ${compact ? "grid-cols-[1.35fr_1fr_1fr]" : "grid-cols-2 sm:grid-cols-3"}`}>
              <div className={compact ? "" : "col-span-2 sm:col-span-1"}>
                <label className="field-label" htmlFor={`ft-${uid}`}>
                  Flat type
                </label>
                <select id={`ft-${uid}`} className="field" value={flatType} onChange={(e) => setFlatType(e.target.value as HdbFlatType)}>
                  {HDB_FLAT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FLAT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor={`area-${uid}`}>
                  Area (sqm) {!compact && <span className="font-normal text-muted">optional</span>}
                </label>
                <input id={`area-${uid}`} className="field" inputMode="numeric" placeholder="e.g. 92" value={area} onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
              <div>
                <label className="field-label" htmlFor={`storey-${uid}`}>
                  Storey {!compact && <span className="font-normal text-muted">optional</span>}
                </label>
                <input id={`storey-${uid}`} className="field" inputMode="numeric" placeholder="e.g. 8" value={storey} onChange={(e) => setStorey(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
          ) : (
            <div className={`grid gap-3 ${compact ? "grid-cols-[1.35fr_1fr_1fr]" : "grid-cols-2 sm:grid-cols-3"}`}>
              <div className={compact ? "" : "col-span-2 sm:col-span-1"}>
                <label className="field-label" htmlFor={`area-${uid}`}>
                  {compact ? (kind === "landed" ? "Land sqft" : "Area sqft") : kind === "landed" ? "Land area (sqft)" : "Floor area (sqft)"}
                </label>
                <input id={`area-${uid}`} className="field" inputMode="numeric" placeholder={kind === "landed" ? "e.g. 1,800" : "e.g. 1,033"} value={area} onChange={(e) => setArea(e.target.value.replace(/[^\d]/g, ""))} />
              </div>
              {kind !== "landed" && (
                <div>
                  <label className="field-label" htmlFor={`storey-${uid}`}>
                    Floor {!compact && <span className="font-normal text-muted">optional</span>}
                  </label>
                  <input id={`storey-${uid}`} className="field" inputMode="numeric" placeholder="e.g. 12" value={storey} onChange={(e) => setStorey(e.target.value.replace(/\D/g, ""))} />
                </div>
              )}
              <div>
                <label className="field-label" htmlFor={`beds-${uid}`}>
                  {compact ? "Beds" : "Bedrooms"} {!compact && <span className="font-normal text-muted">optional</span>}
                </label>
                <input id={`beds-${uid}`} className="field" inputMode="numeric" placeholder="e.g. 3" value={bedrooms} onChange={(e) => setBedrooms(e.target.value.replace(/\D/g, "").slice(0, 1))} />
              </div>
            </div>
          )}

          {status === "loading" ? (
            <div className="rounded-xl bg-surface-2 p-4" aria-live="polite">
              <p className="text-sm font-semibold">{steps[step]}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full origin-left rounded-full bg-primary" style={{ animation: "bar 5s cubic-bezier(0.3,0.6,0.3,1) forwards" }} />
              </div>
            </div>
          ) : (
            <button type="submit" className="btn btn-primary w-full" disabled={!canRun} aria-disabled={!canRun}>
              Get my instant valuation <span aria-hidden className="arrow">→</span>
            </button>
          )}

          {status === "error" && (
            <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <p className={`text-[13px] text-muted ${compact ? "[@media(max-height:700px)]:hidden" : ""}`}>
            {compact ? "Free · about 30 seconds · no sign-up to see your estimate" : "Free, takes about 30 seconds. No sign-up needed to see your estimate."}
          </p>
        </form>
      )}

      {status === "done" && valuation && (
        <div className="mt-4" aria-live="polite">
          <p className="text-sm text-muted">{valuation.subject}</p>
          <div className="sky mt-3 rounded-2xl p-5 text-panel-fg ring-1 ring-primary/15">
            <span className="caps text-[11px] text-panel-muted">Estimated market value</span>
            <p className="num mt-1 text-[38px] leading-tight text-primary sm:text-[46px]">
              {short(valuation.low)} <span className="text-panel-muted">–</span> {short(valuation.high)}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-primary/15 pt-3 text-sm">
              <span>
                Most likely <strong className="num text-[18px]">{fmt(valuation.mid)}</strong>
              </span>
              {valuation.psf && <span className="text-panel-muted">≈ {fmt(valuation.psf)} psf</span>}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <span className="block text-[12.5px] text-muted">Confidence</span>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${valuation.confidence}%` }} />
                </div>
                <strong>{valuation.confidence}%</strong>
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <span className="block text-[12.5px] text-muted">Method</span>
              <strong className="mt-1 block leading-snug">{METHOD_LABEL[valuation.method]}</strong>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{valuation.basis}</p>

          {/* Full report: gated */}
          <div className="mt-5 rounded-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Sub className="text-[15px] font-semibold">Your full valuation report</Sub>
              <span className="caps text-[10.5px] text-muted">{lead === "unlocked" ? "Unlocked" : "Locked"}</span>
            </div>

            {lead === "unlocked" ? (
              <Report v={valuation} name={leadName} />
            ) : (
              <div className="relative">
                <div className="pointer-events-none select-none px-4 py-3 blur-[5px]" aria-hidden>
                  <PreviewRows v={valuation} />
                </div>
                <form onSubmit={unlock} noValidate className="relative border-t border-border bg-surface px-4 pb-4 pt-4">
                  <p className="text-sm font-semibold">
                    See the {valuation.report.comparables.length || "recent"} comparable sales, our adjustments and a pricing strategy for your home.
                  </p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="field-label" htmlFor={`ln-${uid}`}>
                        Full name
                      </label>
                      <input id={`ln-${uid}`} name="name" className="field" autoComplete="name" required />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="field-label" htmlFor={`lp-${uid}`}>
                          Mobile
                        </label>
                        <input id={`lp-${uid}`} name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="+65 9123 4567" required />
                      </div>
                      <div>
                        <label className="field-label" htmlFor={`le-${uid}`}>
                          Email
                        </label>
                        <input id={`le-${uid}`} name="email" className="field" type="email" autoComplete="email" required />
                      </div>
                    </div>
                    <label className="flex items-start gap-2.5 text-[13px] leading-snug text-muted">
                      <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--tw-primary)]" />
                      I agree to be contacted by phone, WhatsApp or email about my valuation, in line with the PDPA. No spam, no third parties.
                    </label>
                    <input type="text" name="_hp" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
                    {leadError && (
                      <p className="text-sm text-danger" role="alert">
                        {leadError}
                      </p>
                    )}
                    <button type="submit" className="btn btn-primary w-full" disabled={lead === "sending"}>
                      {lead === "sending" ? "Unlocking…" : submitLabel} {lead !== "sending" && <span aria-hidden className="arrow">→</span>}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <button type="button" onClick={reset} className="mt-3 min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            ← Value another property
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewRows({ v }: { v: Valuation }) {
  const rows = v.report.comparables.length
    ? v.report.comparables.slice(0, 3)
    : [
        { month: "2026-09", label: "Comparable sale in your project", price: v.mid * 0.98, detail: "", psf: null },
        { month: "2026-08", label: "Comparable sale nearby", price: v.mid * 1.02, detail: "", psf: null },
      ];
  return (
    <ul className="grid gap-2 text-sm">
      {rows.map((c, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span>{c.label}</span>
          <span className="num">{fmt(c.price)}</span>
        </li>
      ))}
      <li className="text-muted">Pricing strategy · adjustments · caveats</li>
    </ul>
  );
}

function Report({ v, name }: { v: Valuation; name: string }) {
  return (
    <div className="grid gap-5 px-4 py-4 text-sm">
      <p className="rounded-xl bg-primary-soft p-3 text-primary">
        <strong>Thanks{name ? `, ${name}` : ""}.</strong> Your report is below, and your agent will be in touch to walk you through it.
      </p>

      {v.report.comparables.length > 0 && (
        <section>
          <h4 className="caps text-[11px] text-muted">Comparable sales</h4>
          <ul className="mt-2 divide-y divide-border">
            {v.report.comparables.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold">{c.label}</span>
                  <span className="block text-[12.5px] text-muted">
                    {c.month}
                    {c.detail ? ` · ${c.detail}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block font-semibold">{fmt(c.price)}</span>
                  {c.psf && <span className="block text-[12.5px] text-muted">{fmt(c.psf)} psf</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.report.trend && (
        <section>
          <h4 className="caps text-[11px] text-muted">Market trend</h4>
          <p className="mt-1.5 first-letter:uppercase">{v.report.trend}</p>
        </section>
      )}

      <section>
        <h4 className="caps text-[11px] text-muted">How we got there</h4>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          {v.report.adjustments.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="caps text-[11px] text-muted">Pricing strategy</h4>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          {v.report.strategy.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="caps text-[11px] text-muted">What this doesn&apos;t include</h4>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
          {v.report.caveats.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
        {v.sources.length > 0 && <p className="mt-2 text-[12.5px] text-muted">Sources: {v.sources.join(", ")}</p>}
      </section>
    </div>
  );
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
