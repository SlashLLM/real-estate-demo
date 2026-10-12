import type { Metadata } from "next";
import { Cta } from "@/components/site/Cta";
import { leadFormId } from "@/components/site/lead-form";
import { ClosingBand, PageHero, SectionHead } from "@/components/site/sections";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sell your home",
  description:
    "Sell your HDB flat, condo or landed home in Singapore with pricing built from real transactions, professional marketing and a negotiation plan around your floor price.",
};

const process = [
  { t: "Valuation & pricing", d: "Start with the instant valuation, then an in-person appraisal. You get a list price, an offer target and a floor, each backed by recent sales." },
  { t: "Preparation & marketing", d: "Professional photography, a 3D virtual tour and floor plan, and featured listings on PropertyGuru and 99.co, written for the buyers most likely to pay your price." },
  { t: "Viewings", d: "Viewings are scheduled around you and buyers are qualified first, so your weekends aren't spent on people who can't proceed." },
  { t: "Negotiation & Option to Purchase", d: "Offers are compared against the evidence, not emotion. When the price is right we grant the Option to Purchase and agree the timeline." },
  { t: "Completion", d: "For HDB, the resale application through the HDB Resale Portal; for private homes, the lawyers and the exercise of the option. One point of contact until you hand over the keys." },
];

const included = [
  "Instant valuation and full report",
  "In-person appraisal and pricing plan",
  "Photography and portal listings",
  "Buyer qualification and viewings",
  "Negotiation and offer comparison",
  "HDB resale / conveyancing coordination",
];

export default async function SellPage() {
  const formId = await leadFormId();
  return (
    <>
      <PageHero
        waveFill="var(--pp-primary-soft)"
        kicker="Selling in Singapore"
        title="Sell at the top of your range, not the middle."
        intro={<>Pricing from actual transactions, marketing aimed at the buyers who&apos;ll pay for your home&apos;s strengths, and negotiation anchored to a floor you set before the first viewing.</>}
      >
        <Cta id="sell-hero-appraisal" />
      </PageHero>

      <section className="bg-primary-soft py-24 sm:py-28" aria-labelledby="process-title">
        <div className="wrap">
          <SectionHead left id="process-title" kicker="The process" title="Five steps from valuation to keys." />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {process.map((p, i) => (
              <li key={p.t} className="card flex flex-col p-6">
                <span className="num flex h-11 w-11 items-center justify-center rounded-2xl bg-highlight text-[17px] text-primary">0{i + 1}</span>
                <h3 className="mt-5 text-[18px] font-extrabold tracking-tight">{p.t}</h3>
                <p className="mt-2 text-[14.5px] text-muted">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section wash" aria-labelledby="plan-title">
        <div className="wrap grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <span className="kicker">What&apos;s included</span>
            <h2 id="plan-title" className="display mt-4 text-[36px] sm:text-[48px]">
              Get your selling plan
            </h2>
            <p className="mt-5 text-muted">
              Tell us about your home and your timing. You&apos;ll get a written plan: the price range from recent sales, the right moment
              to list, and how to sequence it with your next purchase.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {included.map((x) => (
                <li key={x} className="flex gap-2.5 text-[15.5px]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6 sm:p-8 lg:col-span-6">
            <h3 className="text-[20px] font-semibold">Send me my selling plan</h3>
            <p className="mt-1 text-[15px] text-muted">Include your address and when you&apos;d like to move in the message.</p>
            <div className="mt-6">
              <Cta id="sell-inline-plan" formId={formId} />
            </div>
          </div>
        </div>
      </section>

      <ClosingBand title="Not ready to talk yet?" text="Start with the free instant valuation. It takes 30 seconds and shows the evidence behind your price.">
        <Cta id="sell-closing-valuation" variant="primary" />
      </ClosingBand>
    </>
  );
}
