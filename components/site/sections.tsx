import type { ReactNode } from "react";
import { latestResales } from "@/app/(site)/valuation/_lib/hdb";
import { Icon, IconTile, type IconName } from "./icons";

/** Centred section head (SmartHomes): label pill, heavy headline, optional intro. */
export function SectionHead({
  kicker,
  title,
  intro,
  id,
  left,
}: {
  kicker: string;
  title: ReactNode;
  intro?: ReactNode;
  id?: string;
  left?: boolean;
}) {
  return (
    <div className={left ? "max-w-2xl" : "mx-auto max-w-3xl text-center"}>
      <span className="kicker">{kicker}</span>
      <h2 id={id} className="display mt-4 text-[34px] sm:text-[46px]">
        {title}
      </h2>
      {intro && <p className={`mt-4 text-[17px] text-muted ${left ? "" : "mx-auto max-w-2xl"}`}>{intro}</p>}
    </div>
  );
}

/** Wave edge between sections (SmartHomes' hero and process dividers). `fill` is the colour of the section below. */
export function Wave({ fill = "#ffffff", flip = false }: { fill?: string; flip?: boolean }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 ${flip ? "-top-px rotate-180" : "-bottom-px"} leading-none`} aria-hidden>
      <svg className="block h-10 w-full md:h-16" viewBox="0 0 1200 120" preserveAspectRatio="none" fill={fill}>
        <path d="M0,0 C150,90 350,-40 500,45 C650,130 900,10 1200,60 L1200,120 L0,120 Z" />
      </svg>
    </div>
  );
}

/** Badge pill under the header (SmartHomes: "Holiday home & bach management • Across Aotearoa"). */
export function Badge({ icon = "home", label, note }: { icon?: IconName; label: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/90 px-3.5 py-1.5 text-[13px] font-bold shadow-sm">
      <Icon name={icon} className="h-4 w-4 text-primary" />
      {label}
      {note && (
        <span className="hidden items-center gap-2 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
          <span className="font-semibold text-muted">{note}</span>
        </span>
      )}
    </span>
  );
}

/** Inner-page hero in the SmartHomes layout: left-aligned badge, heavy headline, intro, CTA, wave edge. */
export function PageHero({
  kicker,
  title,
  intro,
  children,
  aside,
  waveFill,
}: {
  kicker: string;
  title: ReactNode;
  intro: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  /** Colour of the section below, so the wave edge blends into it. */
  waveFill?: string;
}) {
  return (
    <section className="sky relative overflow-hidden">
      <div className="wrap grid gap-10 pb-24 pt-32 sm:pb-28 sm:pt-36 lg:grid-cols-12 lg:items-center">
        <div className={aside ? "lg:col-span-7" : "lg:col-span-9"}>
          <span className="rise inline-block">
            <Badge label={kicker} note="Islandwide" />
          </span>
          <h1 className="display rise mt-6 text-[42px] sm:text-[60px]">{title}</h1>
          <p className="rise-2 mt-5 max-w-2xl text-[18px] text-muted">{intro}</p>
          {children && <div className="rise-2 mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
        {aside && <div className="rise-2 lg:col-span-5">{aside}</div>}
      </div>
      <Wave fill={waveFill} />
    </section>
  );
}

/** Scrolling proof ticker (SmartHomes' social-proof marquee). Duplicated once so the loop is seamless. */
export function Ticker({ items }: { items: string[] }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((t) => (
        <span key={t} className="flex items-center gap-8 pr-8 text-[13.5px] font-bold text-fg md:text-[14.5px]">
          {t}
          <span className="text-primary" aria-hidden>
            •
          </span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="band overflow-hidden border-y border-border py-3.5">
      <div className="marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** Closing booking block (SmartHomes' "Let's run the numbers on your place"): centred card on a soft gradient. */
export function ClosingBand({ title, highlight, text, children, kicker = "Free · no obligation" }: { title: string; highlight?: string; text: string; children: ReactNode; kicker?: string }) {
  return (
    <section className="section bg-gradient-to-b from-white via-papaya to-cream">
      <div className="wrap">
        <div className="card mx-auto max-w-2xl px-6 py-12 text-center sm:px-12">
          <span className="kicker">{kicker}</span>
          <h2 className="display mt-5 text-[32px] sm:text-[42px]">
            {title} {highlight && <em>{highlight}</em>}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">{text}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      {items.map((it) => (
        <details key={it.q} className="group rounded-3xl border-2 border-border bg-white px-5 py-1 open:bg-cream sm:px-6">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16.5px] font-bold">
            {it.q}
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-highlight text-lg font-bold text-primary transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="pb-5 text-[16px] text-muted">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

export { IconTile };

/** Live ledger of the latest HDB resales from data.gov.sg. */
export async function JustTransacted() {
  const rows = await latestResales(6);
  if (!rows.length) return null;
  const month = new Date(`${rows[0].month}-01T00:00:00Z`).toLocaleString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <section className="section bg-white" aria-labelledby="ledger-title">
      <div className="wrap">
        <SectionHead
          id="ledger-title"
          kicker="Live from data.gov.sg"
          title={<>Just transacted · {month}</>}
          intro="Recent HDB resales across Singapore: the same data your instant valuation is built from."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, i) => (
            <li key={i} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="caps rounded-full bg-highlight px-2.5 py-1 text-[10.5px] text-accent-dark">{r.flatType}</span>
                <span className="caps text-[10.5px] text-muted">{r.town}</span>
              </div>
              <p className="num mt-4 text-[32px] leading-none">${r.price.toLocaleString("en-SG")}</p>
              <p className="mt-3 truncate font-bold">{r.address}</p>
              <p className="text-[14px] text-muted">
                Storey {r.storey} · {r.sqm} sqm
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
