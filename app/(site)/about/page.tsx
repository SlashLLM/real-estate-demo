import type { Metadata } from "next";
import { agent } from "@/components/site/agent";
import { Cta } from "@/components/site/Cta";
import { ClosingBand, PageHero, SectionHead } from "@/components/site/sections";

export const metadata: Metadata = {
  title: "About",
  description: `Meet ${agent.name}, the Singapore property consultant behind PropertyPro AI, who prices every home from real transactions and explains every number.`,
};

const principles = [
  { t: "Evidence over opinion", d: "Every price recommendation comes with the transactions behind it. If the data says wait, you'll hear that too." },
  { t: "Plain English", d: "Lease decay, MOP, ABSD, COV, TDSR: explained in a sentence, not buried in jargon." },
  { t: "One point of contact", d: "From the first valuation to the day you collect your keys, you deal with one person, not a call centre." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        kicker="About"
        title={<>A personal agent who prices <em>with data.</em></>}
        intro="PropertyPro AI pairs instant, transaction-based valuations with a real, CEA-registered agent. The software gives you the range in seconds; the agent helps you get the best price in it."
      />

      <section className="section" aria-labelledby="story-title">
        <div className="wrap grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="card p-7">
              <div className="num flex h-20 w-20 items-center justify-center rounded-full bg-lime text-[32px]" aria-hidden>
                {agent.initials}
              </div>
              <p className="mt-5 text-[21px] font-semibold">{agent.name}</p>
              <p className="text-muted">{agent.role}</p>
              <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-[14.5px]">
                <div>
                  <dt className="text-muted">CEA registration</dt>
                  <dd>{agent.ceaReg}</dd>
                </div>
                <div>
                  <dt className="text-muted">Agency · licence</dt>
                  <dd>
                    {agent.agency} · {agent.agencyLicence}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Focus areas</dt>
                  <dd>{agent.areas}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="lg:col-span-8">
            <span className="kicker">The story</span>
            <h2 id="story-title" className="display mt-4 text-[36px] sm:text-[48px]">
              Why {agent.firstName} built PropertyPro AI
            </h2>
            <div className="mt-6 grid gap-4 text-[17px] text-muted">
              <p>
                {agent.firstName} spent the first years of a property career watching homeowners hear a price from whichever agent wanted
                the listing most. Some flats sat unsold for months because they were priced on hope; others went far too cheaply because
                nobody showed the owners what their neighbours had actually achieved.
              </p>
              <p>
                Since then, more than 180 families across {agent.areas} have sold, bought or upgraded with the same approach: start from the
                transactions, adjust honestly for floor, lease and condition, and agree a floor price before the first viewing.
              </p>
              <p>
                PropertyPro AI puts the first step of that process online. The evidence comes first, free and instantly. Whether you then
                want help is entirely up to you.
              </p>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4">
              {agent.stats.map((s) => (
                <div key={s.label} className="card flex flex-col-reverse p-5 text-center">
                  <dt className="mt-1 text-[14px] text-muted">{s.label}</dt>
                  <dd className="num text-[34px] leading-none text-primary">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="section wash" aria-labelledby="principles-title">
        <div className="wrap">
          <SectionHead id="principles-title" kicker="How we work" title="Three promises" />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {principles.map((p, i) => (
              <li key={p.t} className="card p-7">
                <span className="num flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[24px] text-primary">{i + 1}</span>
                <h3 className="mt-5 text-[20px] font-semibold">{p.t}</h3>
                <p className="mt-2 text-muted">{p.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="reviews-title">
        <div className="wrap">
          <SectionHead id="reviews-title" kicker="Clients" title="What clients say" />
          <ul className="mt-12 grid gap-5 md:grid-cols-3">
            {agent.testimonials.map((t) => (
              <li key={t.name} className="card flex flex-col p-7">
                <span className="text-[15px] text-primary" aria-label="5 out of 5 stars">
                  ★★★★★
                </span>
                <blockquote className="display mt-4 flex-1 text-[22px] leading-snug">&ldquo;{t.quote}&rdquo;</blockquote>
                <p className="mt-6 text-[15px] font-semibold">{t.name}</p>
                <p className="text-[14px] text-muted">{t.property}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ClosingBand title="Let's talk about your plans." text="A short call to understand what you want to do next, whether that's selling, buying or both. No obligation.">
        <Cta id="about-closing-call" />
      </ClosingBand>
    </>
  );
}
