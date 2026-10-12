import type { Metadata } from "next";
import { agent, cases } from "@/components/site/agent";
import { Cta } from "@/components/site/Cta";
import { HeroDoodle } from "@/components/site/HeroDoodle";
import { Icon } from "@/components/site/icons";
import { leadFormId } from "@/components/site/lead-form";
import { Badge, ClosingBand, Faq, JustTransacted, SectionHead, Ticker, Wave } from "@/components/site/sections";
import { ValuationWidget } from "@/components/site/ValuationWidget";
import { site } from "@/site.config";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: `${site.name}: free instant home valuation in Singapore` },
  description:
    "What is your HDB flat, condo or landed home worth today? Get a free instant valuation from recent Singapore transactions, then a full report and personal advice from your agent.",
};

const k = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
const pct = (a: number, b: number) => `${b >= a ? "+" : ""}${(((b - a) / a) * 100).toFixed(1)}%`;

const steps = [
  { t: "Instant valuation", d: "Enter your postal code and get a price range from recent transactions in about 30 seconds.", bullets: ["Real HDB resale data, updated daily", "Adjusted for floor, lease and size", "No sign-up to see your range"] },
  { t: "Full report", d: "Unlock the evidence behind the number, then a personal walkthrough of what it means for you.", bullets: ["Every comparable sale", "Pricing strategy and floor price", "Your next-move timeline"] },
  { t: "Home appraisal", d: `${agent.firstName} views your home and checks the latest caveats for your exact stack and floor.`, bullets: ["In-person viewing", "Renovation, facing and view priced in", "List price, offer target and floor"] },
  { t: "Sell and move", d: "Marketing, viewings and negotiation built around the evidence, through to completion.", bullets: ["Photos, 3D tour, portal listings", "Offers compared against sales", "OTP to keys, handled"] },
];

const faqs = [
  {
    q: "How accurate is the instant valuation?",
    a: "For HDB flats it's built from actual resale transactions on your street (and your block when there are any), brought to today's money and adjusted for floor and lease. Most homes sell within the range shown, and the confidence score tells you how strong the evidence is. Condos and landed homes are estimated from a live search of recent transactions and listings, then confirmed against URA caveats.",
  },
  {
    q: "Does it include cash over valuation (COV)?",
    a: "No. The range is what comparable homes actually sold for. How much of that a buyer pays in cash depends on the bank or HDB valuation and their loan, which we plan for together.",
  },
  {
    q: "Why does the remaining lease matter so much?",
    a: "HDB flats are on 99-year leases, and buyers pay less as the lease runs down, faster once it drops below about 60 years. We only compare against similar-age blocks and adjust for the difference.",
  },
  {
    q: "Is there any cost or commitment?",
    a: "No. The valuation, the full report and the home appraisal are free. You only pay a commission if you choose to sell with us, and that's agreed in writing first.",
  },
  {
    q: "What happens to my details?",
    a: "They're used only to send your report and follow up about your valuation. They aren't sold or shared, and you can ask to be removed at any time, in line with the PDPA.",
  },
];

export default async function Home() {
  const formId = await leadFormId();
  const f = cases.featured;
  return (
    <>
      {/* HERO + CALCULATOR (SmartHomes): badge, heavy headline with highlighted phrase, copy and stat chips on the left,
          the calculator card on the right, a biro doodle drawing itself behind; wave edge. Fits the first viewport. */}
      <section className="relative isolate overflow-hidden bg-cream">
        {/* The biro doodle of a Singapore street draws itself behind the hero, then idles (anidoodle; art/house-doodle). */}
        <HeroDoodle />
        <div className="wrap grid min-h-[100svh] content-center items-center gap-6 pb-16 pt-[92px] lg:grid-cols-12 lg:gap-10 lg:pb-20 lg:pt-[96px] [@media(max-height:700px)]:gap-3">
          <div className="lg:col-span-7 lg:self-start lg:pt-[3vh]">
            <span className="rise inline-block [@media(max-height:700px)]:hidden">
              <Badge label="Singapore home valuations" note="HDB · Condo · Landed" />
            </span>
            <h1 className="display rise mt-4 text-[38px] sm:mt-5 sm:text-[56px] xl:text-[64px] [@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:text-[34px]">
              What&apos;s your home <br className="hidden sm:block" />
              worth <span className="hl">today?</span>
            </h1>
            <p className="rise-2 mt-5 hidden max-w-xl text-[18px] text-muted sm:block">
              Free instant valuations built from the latest Singapore transactions, then a full report and pricing plan from an agent
              who prices with evidence, not guesswork.
            </p>

            <ul className="rise-2 mt-6 hidden flex-wrap gap-2 lg:flex [@media(max-height:780px)]:hidden">
              {agent.stats.map((s) => (
                <li key={s.label} className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-white/85 px-3.5 py-1.5 text-[13.5px] shadow-sm backdrop-blur">
                  <strong className="num text-[16px] text-primary">{s.value}</strong>
                  <span className="text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div id="valuation" className="rise-2 scroll-mt-24 lg:col-span-5">
            <ValuationWidget cta="home-hero-valuation" submitLabel={site.ctas["home-hero-valuation"].label} formId={formId} compact />
            <p className="mt-3 text-center">
              <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 rounded-full border border-border bg-white/90 px-4 text-[14.5px] text-muted shadow-sm backdrop-blur">
                Prefer to talk it through? <Cta id="home-hero-book-call" variant="text" />
              </span>
            </p>
          </div>
        </div>
        <Wave fill="var(--pp-papaya)" />
      </section>

      {/* SOCIAL PROOF TICKER */}
      <Ticker
        items={[
          `★ ${agent.stats[2].value.replace("★", "")} average Google rating`,
          `${agent.stats[0].value} homes sold across Singapore`,
          `${agent.stats[1].value} transacted for clients`,
          "HDB resale data updated daily",
          "Valuations in about 30 seconds",
          "CEA-registered agent",
        ]}
      />

      {/* PROCESS: four numbered step cards with checklists, in a tinted band */}
      <section className="relative overflow-hidden bg-primary-soft py-24 sm:py-28" id="process" aria-labelledby="process-title">
        <div className="wrap">
          <SectionHead
            left
            id="process-title"
            kicker="The process"
            title={
              <>
                From postal code to sold, <br className="hidden sm:block" />
                in four steps.
              </>
            }
          />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t} className="card flex flex-col p-6">
                <span className="num flex h-11 w-11 items-center justify-center rounded-2xl bg-highlight text-[17px] text-primary">0{i + 1}</span>
                <h3 className="mt-5 text-[19px] font-extrabold tracking-tight">{s.t}</h3>
                <p className="mt-2 flex-1 text-[15px] text-muted">{s.d}</p>
                <ul className="mt-5 grid gap-1.5 rounded-2xl bg-cream p-3.5 text-[13.5px] font-semibold">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {b}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* RESULTS: featured case, three case cards, stats bar */}
      <section className="section bg-cream" id="results" aria-labelledby="results-title">
        <div className="wrap">
          <SectionHead id="results-title" kicker="Recent sales · real results" title="What the valuation said, and what it sold for." />

          <article className="card mt-12 grid overflow-hidden lg:grid-cols-12">
            <div className="sky relative flex min-h-64 flex-col justify-between p-7 lg:col-span-5">
              <span className="caps self-start rounded-full bg-white px-3 py-1.5 text-[10.5px] text-accent-dark shadow-sm">{f.place}</span>
              <div>
                <p className="num text-[56px] leading-none text-primary">{k(f.sold)}</p>
                <p className="mt-2 font-bold">Sold in {f.days} days</p>
                <p className="text-[14px] text-muted">{f.detail}</p>
              </div>
            </div>
            <div className="p-7 sm:p-9 lg:col-span-7">
              <span className="caps text-[11px] text-primary">{f.title}</span>
              <blockquote className="mt-3 text-[22px] font-bold leading-snug tracking-tight">&ldquo;{f.quote}&rdquo;</blockquote>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Our estimate", k(f.estimate)],
                  ["Sold for", k(f.sold)],
                  ["Vs estimate", pct(f.estimate, f.sold)],
                  ["Days on market", String(f.days)],
                ].map(([l, v], i) => (
                  <div key={l} className={`flex flex-col-reverse rounded-2xl border px-3 py-2.5 ${i === 2 ? "border-emerald-200 bg-emerald-50" : "border-border bg-cream"}`}>
                    <dt className="caps mt-1 text-[9.5px] text-muted">{l}</dt>
                    <dd className={`num text-[18px] ${i === 2 ? "text-emerald-700" : ""}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-highlight text-[13px] font-extrabold text-primary">WJ</span>
                <span className="text-[14px]">
                  <strong className="block">{f.client}</strong>
                  <span className="text-muted">{f.since}</span>
                </span>
              </div>
            </div>
          </article>

          <ul className="mt-5 grid gap-5 md:grid-cols-3">
            {cases.more.map((c) => (
              <li key={c.place} className="card flex flex-col p-6">
                <span className="caps text-[10.5px] text-muted">{c.place}</span>
                <h3 className="mt-2 text-[19px] font-extrabold tracking-tight">{c.title}</h3>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Estimate", k(c.estimate)],
                    ["Sold", k(c.sold)],
                    ["Change", pct(c.estimate, c.sold)],
                  ].map(([l, v], i) => (
                    <div key={l} className={`flex flex-col-reverse rounded-xl border px-2.5 py-2 ${i === 2 ? "border-emerald-200 bg-emerald-50" : "border-border bg-cream"}`}>
                      <dt className="caps mt-0.5 text-[9px] text-muted">{l}</dt>
                      <dd className={`num text-[15px] ${i === 2 ? "text-emerald-700" : ""}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 flex-1 text-[14.5px] italic text-muted">&ldquo;{c.quote}&rdquo;</p>
                <p className="mt-4 text-[14px] font-bold">
                  {c.client} <span className="font-medium text-muted">· sold in {c.days} days</span>
                </p>
              </li>
            ))}
          </ul>

          <dl className="card mt-5 grid grid-cols-2 gap-6 bg-papaya p-6 text-center sm:grid-cols-4">
            {cases.totals.map((t) => (
              <div key={t.label} className="flex flex-col-reverse">
                <dt className="mt-1 text-[13px] text-muted">{t.label}</dt>
                <dd className="num text-[30px] leading-none">{t.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <JustTransacted />

      {/* FAQ */}
      <section className="section bg-white" id="faq" aria-labelledby="faq-title">
        <div className="wrap">
          <SectionHead id="faq-title" kicker="For homeowners" title="The honest answers, before you value." />
          <div className="mt-12">
            <Faq items={faqs} />
          </div>
        </div>
      </section>

      {/* BOOKING */}
      <ClosingBand
        kicker="Free, on-site, no obligation"
        title="Let's run the numbers on"
        highlight="your home."
        text={`A 30-minute visit from ${agent.firstName}, a written price range by the end of the week, and a plan for selling, upgrading or staying put.`}
      >
        <div className="text-left">
          <Cta id="home-closing-appraisal" formId={formId} />
        </div>
        <ul className="mt-6 grid gap-2 text-left text-[14px] font-semibold sm:grid-cols-2">
          {["No fees unless you sell", "Written range within the week", "Latest caveats for your stack", "CEA-registered agent"].map((t) => (
            <li key={t} className="flex gap-2">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14.5px] text-muted">
          Rather see a number first? <Cta id="home-closing-valuation" variant="text" />
        </p>
      </ClosingBand>
    </>
  );
}
