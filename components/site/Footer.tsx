import Link from "next/link";
import { site } from "@/site.config";
import { agent } from "./agent";
import { Cta } from "./Cta";
import { Logo } from "./Header";
import { Icon } from "./icons";
import { navHref } from "./nav";
import { Ph } from "./Ph";

const serving = ["Ang Mo Kio", "Bishan", "Toa Payoh", "Tampines", "Serangoon", "Bukit Timah", "Queenstown", "Punggol"];

/** SmartHomes footer: tinted band, brand + contact column, Explore, Serving, then the compliance line. */
export function Footer() {
  const socials = Object.entries(site.social ?? {}) as [string, string][];
  return (
    <footer className="band mt-auto border-t border-border pb-10 pt-16">
      <div className="wrap grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Logo />
          <span className="kicker mt-5">Singapore · islandwide</span>
          <p className="mt-4 max-w-sm text-[15.5px] text-muted">
            Free instant home valuations from real transactions, then a CEA-registered agent to help you sell, upgrade or buy with the
            same evidence.
          </p>
          <ul className="mt-5 grid gap-2.5 text-[15px]">
            <li className="flex items-center gap-2.5">
              <Icon name="phone" className="h-4 w-4 text-primary" />
              <Ph text={site.contact.phone} />
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="mail" className="h-4 w-4 text-primary" />
              <Ph text={site.contact.email} />
            </li>
            <li className="flex items-start gap-2.5 text-muted">
              <Icon name="pin" className="mt-1 h-4 w-4 shrink-0 text-primary" />
              {site.contact.address}
            </li>
            <li className="flex items-center gap-2.5 text-muted">
              <Icon name="clock" className="h-4 w-4 text-primary" />
              {agent.hours}
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Cta id="footer-valuation" size="sm" />
            <Cta id="footer-contact" variant="outline" size="sm" />
          </div>
        </div>

        <nav className="lg:col-span-3" aria-label="Footer">
          <h2 className="caps text-[11.5px] text-primary">Explore</h2>
          <ul className="mt-4 grid gap-1">
            {site.nav.map((n) => (
              <li key={n.href}>
                <Link href={navHref(n.href, "footer-nav")} className="inline-flex min-h-10 items-center text-[15.5px] font-medium hover:text-primary">
                  {n.label}
                </Link>
              </li>
            ))}
            {socials.map(([k, href]) => (
              <li key={k}>
                <a href={href} className="inline-flex min-h-10 items-center text-[15.5px] font-medium capitalize hover:text-primary" rel="noopener" target="_blank">
                  {k}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-4">
          <h2 className="caps text-[11.5px] text-primary">Serving</h2>
          <p className="mt-4 text-[15.5px] leading-relaxed">{serving.join(" · ")} and the rest of Singapore.</p>
          <div className="card-flat mt-6 p-4 text-[14px]">
            <p className="font-bold">{agent.name}</p>
            <p className="text-muted">{agent.role}</p>
            <p className="mt-2 text-muted">
              CEA Reg. {agent.ceaReg} · {agent.agency} · Licence {agent.agencyLicence}
            </p>
          </div>
        </div>
      </div>

      <div className="wrap mt-12 grid gap-2 border-t border-border pt-6 text-[13px] leading-relaxed text-muted">
        <p>
          Valuations are indicative estimates, not formal valuations. HDB resale data: Housing &amp; Development Board via data.gov.sg (Singapore Open
          Data Licence). Address search: OneMap, Singapore Land Authority. Hero photo: Galen Crout on Unsplash.
        </p>
        <p>
          © {new Date().getFullYear()} {site.name}. Your details are used only to respond to your enquiry, in line with the PDPA.
        </p>
      </div>
    </footer>
  );
}
