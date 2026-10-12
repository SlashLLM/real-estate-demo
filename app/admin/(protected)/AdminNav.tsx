"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// AI studio lives inside Social (its sub-nav), so the top bar only lists the sections.
const SECTIONS = [
  ["Social", "/admin/social"],
  ["CRM", "/admin/crm"],
] as const;

/** Top-level admin sections; the current section stays highlighted on all of its sub-pages. */
export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Admin" className="flex gap-1 text-sm">
      {SECTIONS.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-ui px-3 py-1.5 ${active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
