import Link from "next/link";
import { LeadCaptureForm } from "@totalweb/crm/components";
import { site } from "@/site.config";

type CtaId = keyof typeof site.ctas;
type CtaDef = { label: string; href?: string; inline?: boolean };

/** Adds `cta=<id>` to an href, before any #hash. */
export function ctaHref(href: string, id: string) {
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}cta=${encodeURIComponent(id)}${hash ? `#${hash}` : ""}`;
}

export function ctaDef(id: CtaId): CtaDef {
  return site.ctas[id] as CtaDef;
}

/**
 * Every call to action on the site. Link CTAs carry their id to the landing page (`?cta=`), inline CTAs embed the
 * CRM lead form with the id, so each lead in /admin/crm shows the CTA that brought it in (Source `website_cta:<id>`).
 */
export function Cta({
  id,
  variant = "primary",
  size,
  formId,
  className = "",
}: {
  id: CtaId;
  variant?: "primary" | "outline" | "light" | "text";
  size?: "sm";
  /** Required for inline CTAs (look it up with leadFormId() in a server component). */
  formId?: string;
  className?: string;
}) {
  const def = ctaDef(id);
  if (def.inline) {
    if (!formId) {
      return (
        <p className={`text-sm text-muted ${className}`}>
          Our enquiry form is being set up. In the meantime, please call or email us using the contact details at the foot of this page.
        </p>
      );
    }
    return <LeadCaptureForm formId={formId} cta={id} submitLabel={def.label} className={`lead-form grid gap-4 ${className}`} />;
  }
  const href = ctaHref(def.href ?? "/contact", id);
  if (variant === "text") {
    return (
      <Link href={href} className={`inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline ${className}`}>
        {def.label} <span aria-hidden>→</span>
      </Link>
    );
  }
  return (
    <Link href={href} className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}>
      {def.label} <span aria-hidden className="arrow">→</span>
    </Link>
  );
}
