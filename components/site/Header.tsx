"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { site } from "@/site.config";
import { navHref } from "./nav";

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label={`${site.name} home`}>
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--tw-primary)" />
        <path d="M8 23V14l8-6 8 6v9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M13.5 23v-5h5v5" fill="#fff" />
      </svg>
      <span className="text-[19px] font-extrabold tracking-tight">
        PropertyPro<sup className="ml-0.5 text-[10px] font-bold text-primary">AI</sup>
      </span>
    </Link>
  );
}

/**
 * SmartHomes header: fixed over the hero, transparent at the top and frosted once scrolled; nav links sit in a
 * centred pill with the current page as a white chip. The primary button is passed in from the server layout so it
 * renders through <Cta/>. Every page's first section leaves room for it (pt-24 and up).
 */
export function Header({ primary }: { primary: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = site.nav.filter((n) => n.href !== "/");

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled || open ? "border-b border-border bg-white/90 shadow-sm backdrop-blur" : "bg-transparent"
      }`}
    >
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center rounded-full border border-border bg-papaya/90 px-1.5 py-1 shadow-sm lg:flex" aria-label="Main">
          {links.map((n) => {
            const current = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={navHref(n.href)}
                aria-current={current ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[14.5px] font-semibold transition-colors ${
                  current ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:block">{primary}</div>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="wrap pb-4 lg:hidden" aria-label="Main">
          <div className="card grid gap-1 p-3">
            {site.nav.map((n) => (
              <Link
                key={n.href}
                href={navHref(n.href)}
                aria-current={pathname === n.href ? "page" : undefined}
                className="flex min-h-12 items-center rounded-2xl px-3 text-[16px] font-semibold hover:bg-papaya aria-[current=page]:bg-papaya aria-[current=page]:text-primary"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2">{primary}</div>
          </div>
        </nav>
      )}
    </header>
  );
}
