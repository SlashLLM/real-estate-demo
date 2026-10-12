"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["Overview", ""],
  ["Contacts", "/contacts"],
  ["Companies", "/companies"],
  ["Deals", "/deals"],
  ["Tasks", "/tasks"],
] as const;

/** CRM tabs; the tab for the current route (including detail pages like /contacts/[id]) is highlighted. */
export function CrmNav({ basePath }: { basePath: string }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "");
  return (
    <div className="mb-6 border-b border-border">
      {/* Scrolls sideways on narrow screens, without a visible scrollbar. */}
      <nav aria-label="CRM" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map(([label, href]) => {
          const target = `${basePath}${href}`;
          const active = href === "" ? pathname === basePath : pathname === target || pathname.startsWith(`${target}/`);
          return (
            <Link
              key={href}
              href={target}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                active ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
