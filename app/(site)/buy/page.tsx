import type { Metadata } from "next";
import { Cta } from "@/components/site/Cta";
import { leadFormId } from "@/components/site/lead-form";
import { PageHero, SectionHead } from "@/components/site/sections";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Buy a home",
  description:
    "Buy your next Singapore home with a shortlist priced against real transactions, budget and loan checks up front, and negotiation backed by evidence.",
};

const help = [
  { t: "Budget first", d: "What you can actually borrow (HDB loan or bank loan, LTV, TDSR and MSR), what's due in cash and CPF, and whether ABSD applies, before you fall in love with a unit." },
  { t: "A shortlist priced against sales", d: "Every home on your shortlist comes with the recent transactions around it, so you know at a glance whether the asking price is fair." },
  { t: "Negotiation with evidence", d: "Offers anchored to what comparable homes sold for, plus a clear view of valuation and COV risk before you commit." },
  { t: "Paperwork handled", d: "Option to Purchase, HDB resale application or conveyancing, and every deadline in between, coordinated for you." },
];

export default async function BuyPage() {
  const formId = await leadFormId();
  return (
    <>
      <PageHero
        kicker="Buying in Singapore"
        title="Know the fair price before you fall in love."
        intro={<>Whether it&apos;s your first HDB flat, an upgrade to a condo or a home for the next chapter, you&apos;ll see what comparable homes really sold for before you make an offer.</>}
      >
        <Cta id="buy-hero-shortlist" />
      </PageHero>

      <section className="section" aria-labelledby="help-title">
        <div className="wrap">
          <SectionHead id="help-title" kicker="How I help buyers" title="Fewer viewings, better offers" />
          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {help.map((h, i) => (
              <li key={h.t} className="card p-7">
                <span className="font-mono text-[12px] text-muted">0{i + 1}</span>
                <h3 className="mt-3 text-[21px] font-semibold">{h.t}</h3>
                <p className="mt-2 text-muted">{h.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section wash" aria-labelledby="brief-title">
        <div className="wrap grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="kicker">Your brief</span>
            <h2 id="brief-title" className="display mt-4 text-[36px] sm:text-[48px]">
              Tell me what you&apos;re looking for
            </h2>
            <p className="mt-5 text-muted">
              Share your budget, preferred areas, property type and timing in the message. You&apos;ll get matching homes with their nearby
              transaction prices, and a quick call to check the numbers work.
            </p>
          </div>
          <div className="card p-6 sm:p-8 lg:col-span-7">
            <Cta id="buy-inline-brief" formId={formId} />
          </div>
        </div>
      </section>
    </>
  );
}
