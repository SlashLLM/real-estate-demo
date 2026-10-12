"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  ["All posts", "", null],
  ["Review queue", "", "in_review"],
  ["Scheduled", "", "scheduled"],
  ["Published", "", "published"],
  ["Drafts", "", "draft"],
  ["Archived", "", "archived"],
  ["AI writer", "/generate", null],
] as const;

/** Blog tabs; the tab for the current route (and ?status=) is highlighted. */
export function BlogNav({ basePath, counts = {} }: { basePath: string; counts?: Partial<Record<string, number>> }) {
  const pathname = (usePathname() ?? "").replace(/\/+$/, "");
  const status = useSearchParams()?.get("status") ?? null;
  return (
    <div className="mb-6 border-b border-border">
      <nav aria-label="Blog" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map(([label, href, s]) => {
          const target = `${basePath}${href}${s ? `?status=${s}` : ""}`;
          const active = href ? pathname.startsWith(`${basePath}${href}`) : pathname === basePath && status === s;
          const n = s ? counts[s] : undefined;
          return (
            <Link
              key={label}
              href={target}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                active ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {label}
              {!!n && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">{n}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
