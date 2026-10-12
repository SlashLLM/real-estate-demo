import type { Metadata } from "next";
import { Cta } from "@/components/site/Cta";
import { leadFormId } from "@/components/site/lead-form";
import { Badge, ClosingBand, Faq, SectionHead, Wave } from "@/components/site/sections";
import { ValuationWidget } from "@/components/site/ValuationWidget";
import { site } from "@/site.config";
import { HDB } from "./_lib/config";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Free instant home valuation",
  description:
    "Value your HDB flat, condo, EC or landed home in Singapore in 30 seconds, from recent transactions. See how the estimate is built and unlock the full report.",
};

const method = [
  {
    t: "HDB flats: actual resale transactions",
    d: `We pull every resale of your flat type on your street from the last ${HDB.STREET_WINDOW_MONTHS} months (your block first), widening to similar-age blocks in your town only when your street is quiet. Source: Housing & Development Board via data.gov.sg.`,
  },
  {
    t: "Condos, ECs and landed: live market search",
    d: "We search recent transactions and listings for your project and its neighbours, weight completed sales above asking prices, and reject any figure that falls outside sensible bounds for your district.",
  },
  {
    t: "Adjusted to your home",
    d: `Older sales are brought to today's money (about ${(HDB.MONTHLY_GROWTH * 1200).toFixed(1)}% a year), then adjusted for floor (${(HDB.STOREY_PER_FLOOR * 100).toFixed(1)}% per storey) and remaining lease (${(HDB.LEASE_PER_YEAR * 100).toFixed(1)}% per year of difference), with caps so no single factor dominates.`,
  },
  {
    t: "A range, not a promise",
    d: "The mid-point is a weighted median of the adjusted sales, so recent sales in your own block count most. The width of the range comes from how much those sales disagree, and the confidence score says how much evidence there was.",
  },
];

const faqs = [
  { q: "Is this a formal valuation?", a: "No. It's an indicative estimate for planning. Banks and HDB carry out formal valuations when a buyer applies for a loan or a resale application is lodged." },
  { q: "Why is my range wide?", a: "Usually because few similar homes sold recently near you, or because they sold at very different prices (different floors, renovation or facing). Adding your exact floor area and storey tightens it." },
  { q: "My block has no recent sales. Can you still value it?", a: "Yes. We fall back to the same flat type on your street, then to similar-age blocks in your town, and the confidence score drops to tell you so." },
  { q: "Will you call me?", a: "Only if you unlock the full report and agree to be contacted. Your agent will reach out once to walk you through it. No spam, and your details are never shared." },
];

export default async function ValuationPage() {
  const formId = await leadFormId();
  return (
    <>
      <section className="sky relative overflow-hidden">
        <div className="wrap grid gap-10 pb-24 pt-28 sm:pt-32 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5 lg:pt-6">
            <Badge icon="spark" label="Free instant valuation" note="No sign-up" />
            <h1 className="display rise mt-6 text-[42px] sm:text-[58px]">
              What&apos;s your home <span className="hl">worth?</span>
            </h1>
            <p className="rise-2 mt-5 text-[18px] text-muted">
              Enter your postal code and a few details. In about 30 seconds you&apos;ll see an estimated price range, a $ psf figure and
              how confident we are, all built from recent Singapore transactions.
            </p>
            <div className="card mt-8 hidden p-5 lg:block">
              <p className="text-[15px] font-semibold">What you need</p>
              <ul className="mt-2 grid gap-1.5 text-[15px] text-muted">
                <li>· Your postal code or block and street</li>
                <li>· Flat type (HDB) or floor area in sqft (private)</li>
                <li>· Optional: storey and exact floor area, for a tighter range</li>
              </ul>
            </div>
          </div>
          <div className="rise-2 lg:col-span-7">
            <ValuationWidget cta="valuation-tool-report" submitLabel={site.ctas["valuation-tool-report"].label} formId={formId} />
          </div>
        </div>
        <Wave />
      </section>

      <section className="section" aria-labelledby="method-title">
        <div className="wrap">
          <SectionHead
            id="method-title"
            kicker="Methodology"
            title="How your estimate is built"
            intro="No black box. Here is exactly what goes into the number, and what doesn't."
          />
          <ol className="mt-12 grid gap-5 md:grid-cols-2">
            {method.map((m, i) => (
              <li key={m.t} className="card p-7">
                <span className="num flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[24px] text-primary">{i + 1}</span>
                <h3 className="mt-4 text-[20px] font-semibold">{m.t}</h3>
                <p className="mt-2 text-muted">{m.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-[20px] border border-border bg-lime/40 p-6 text-[15.5px]">
            <p className="font-semibold">What the estimate doesn&apos;t include</p>
            <p className="mt-1.5 text-muted">
              Renovation and condition, facing and view, exact stack, cash over valuation (COV), and the buyer&apos;s financing. Your agent
              factors these in when you unlock the report.
            </p>
          </div>
        </div>
      </section>

      <section className="section wash" aria-labelledby="vfaq-title">
        <div className="wrap grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <span className="kicker">Questions</span>
            <h2 id="vfaq-title" className="display mt-4 text-[36px] sm:text-[48px]">
              About the valuation
            </h2>
          </div>
          <div className="lg:col-span-8">
            <Faq items={faqs} />
          </div>
        </div>
      </section>

      <ClosingBand title="Want a price you can list at?" text="Your agent views the home, checks the latest caveats for your exact stack and gives you a list price, an offer target and a floor.">
        <Cta id="valuation-closing-call" variant="primary" />
      </ClosingBand>
    </>
  );
}
