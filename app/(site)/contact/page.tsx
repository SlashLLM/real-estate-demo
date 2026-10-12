import type { Metadata } from "next";
import { LeadCaptureForm } from "@totalweb/crm/components";
import { agent } from "@/components/site/agent";
import { leadFormId } from "@/components/site/lead-form";
import { Ph } from "@/components/site/Ph";
import { Badge, Wave } from "@/components/site/sections";
import { site } from "@/site.config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to your PropertyPro AI agent about selling, buying or upgrading your home in Singapore.",
};

/** The heading follows the CTA that brought the visitor here (?cta=). */
function headingFor(cta?: string) {
  if (!cta) return { title: "Talk to your agent", intro: "Tell me a little about your home or what you're looking for, and I'll get back to you personally." };
  if (cta.includes("appraisal")) return { title: "Book a home appraisal", intro: "Share your address and a couple of times that suit you. I'll confirm a visit and bring the latest transactions for your block or project." };
  if (cta.includes("plan")) return { title: "Get your selling plan", intro: "Share your address and when you'd like to move. Your plan covers price, timing and how to sequence it with your next purchase." };
  if (cta.includes("shortlist")) return { title: "Get a shortlist", intro: "Share your budget, preferred areas, property type and timing, and I'll send homes priced against what actually sold nearby." };
  if (cta.includes("consult") || cta.includes("call")) return { title: "Book a call", intro: "Leave your details and a good time to reach you. Calls take about 15 minutes, with no obligation." };
  return { title: "Talk to your agent", intro: "Tell me a little about your home or what you're looking for, and I'll get back to you personally." };
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ submitted?: string; cta?: string }> }) {
  const [formId, { submitted, cta }] = await Promise.all([leadFormId(), searchParams]);
  const h = headingFor(cta);
  return (
    <section className="sky relative overflow-hidden">
    <div className="wrap grid gap-12 pb-28 pt-28 sm:pt-32 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <Badge icon="phone" label="Contact" note={agent.hours} />
        <h1 className="display rise mt-6 text-[42px] sm:text-[56px]">{h.title}</h1>
        <p className="rise-2 mt-5 text-[18px] text-muted">{h.intro}</p>
        <dl className="mt-10 grid gap-4 border-t border-border pt-6 text-[16px]">
          <div>
            <dt className="text-[14px] text-muted">Mobile / WhatsApp</dt>
            <dd>
              <Ph text={site.contact.phone} />
            </dd>
          </div>
          <div>
            <dt className="text-[14px] text-muted">Email</dt>
            <dd>
              <Ph text={site.contact.email} />
            </dd>
          </div>
          <div>
            <dt className="text-[14px] text-muted">Hours</dt>
            <dd>
              <Ph text={agent.hours} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="card p-6 sm:p-8 lg:col-span-7">
        {submitted === "1" ? (
          <p role="status" className="text-[18px]">
            Thanks! I&apos;ll be in touch shortly.
          </p>
        ) : formId ? (
          <LeadCaptureForm formId={formId} submitLabel="Send message" className="lead-form grid gap-4" />
        ) : (
          <p className="text-muted">Our enquiry form is being set up. Please call or email using the details on this page.</p>
        )}
      </div>
    </div>
    <Wave />
    </section>
  );
}
