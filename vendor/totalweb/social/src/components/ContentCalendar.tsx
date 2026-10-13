"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, formatDateTime, useHydrated } from "@totalweb/ui";
import { PLATFORMS } from "../core/platforms.ts";
import type { Account, MediaAsset, Post } from "../types";
import { PostComposerModal, type ComposerInitial } from "./PostComposerModal";
import { PostStatusModal } from "./PostStatus";
import { StatusBadge } from "./shared";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** The day a post falls on: the viewer's local day once hydrated; before that UTC, which the server renders too. */
const dayOf = (iso: string, hydrated: boolean) => {
  const d = new Date(iso);
  return hydrated ? key(d) : `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

export function postToInitial(p: Post): ComposerInitial {
  return {
    id: p.id,
    content: p.content,
    title: p.title,
    link: p.link,
    mediaIds: p.media_ids,
    tags: p.tags,
    topic: p.topic,
    scheduledAt: p.scheduled_at,
    accountIds: p.targets.map((t) => t.account_id),
    overrides: Object.fromEntries(p.targets.filter((t) => t.content_override).map((t) => [t.account_id, t.content_override!])),
    options: Object.fromEntries(p.targets.map((t) => [t.account_id, t.options ?? {}])),
  };
}

/** Month grid of scheduled/published posts. `month` is "YYYY-MM" (driven by ?month=). */
export function ContentCalendar({
  month,
  posts,
  accounts,
  mediaLibrary,
  apiBase,
}: {
  month: string;
  posts: Post[];
  accounts: Account[];
  mediaLibrary: MediaAsset[];
  apiBase?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [composer, setComposer] = useState<{ open: boolean; initial?: ComposerInitial; nonce: number }>({ open: false, nonce: 0 });

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  // Days, "today" and post times depend on the viewer's timezone, which the server doesn't know: render them from
  // the hydrated flag so the first client render matches the server's HTML, then switch to local time.
  const hydrated = useHydrated();
  const today = hydrated ? key(new Date()) : null;
  const monthLabel = hydrated
    ? first.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const k = dayOf(p.scheduled_at, hydrated);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [posts, hydrated]);

  const go = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    router.push(`${pathname}?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const open = (initial?: ComposerInitial) => setComposer((c) => ({ open: true, initial, nonce: c.nonce + 1 }));
  // Drafts open in the editor; anything scheduled or sent opens its status (editing is offered while nothing went out).
  const [statusOf, setStatusOf] = useState<Post | null>(null);
  const show = (p: Post) => (p.status === "draft" ? open(postToInitial(p)) : setStatusOf(p));
  const drafts = posts.filter((p) => p.status === "draft" && !p.scheduled_at);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => go(-1)} aria-label="Previous month">
          ‹
        </Button>
        <h2 className="min-w-40 text-center font-medium">{monthLabel}</h2>
        <Button variant="secondary" size="sm" onClick={() => go(1)} aria-label="Next month">
          ›
        </Button>
        <div className="flex-1" />
        <Button onClick={() => open()}>Create post</Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-ui border border-border">
          {DAY_NAMES.map((d) => (
            <div key={d} className="bg-surface-2 p-2 text-center text-xs font-medium text-muted">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const k = key(d);
            const inMonth = d.getMonth() === m - 1;
            const items = byDay.get(k) ?? [];
            return (
              <div
                key={k}
                className={`group min-h-28 border-t border-l border-border p-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${inMonth ? "bg-surface" : "bg-surface-2/50 text-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${k === today ? "rounded-full bg-primary px-1.5 text-primary-fg" : ""}`}>{d.getDate()}</span>
                  <button
                    className="text-xs text-muted opacity-0 group-hover:opacity-100"
                    aria-label={`Create post on ${d.toDateString()}`}
                    onClick={() => {
                      const at = new Date(d);
                      at.setHours(10, 0, 0, 0);
                      open({ scheduledAt: at.toISOString() });
                    }}
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => show(p)}
                      className="block w-full truncate rounded border border-border bg-bg px-1.5 py-0.5 text-left text-[11px] hover:border-primary"
                      title={p.content}
                    >
                      <span className="mr-1 inline-flex gap-0.5 align-middle">
                        {[...new Set(p.targets.map((t) => t.platform))].map((pl) => (
                          <span key={pl} className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: PLATFORMS[pl].color }} />
                        ))}
                      </span>
                      {formatDateTime(p.scheduled_at!, { hour: "numeric", minute: "2-digit" }, hydrated, "time")}{" "}
                      {p.content.slice(0, 40) || p.title}
                    </button>
                  ))}
                  {items.length > 4 && <p className="text-[11px] text-muted">+{items.length - 4} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {drafts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Unscheduled drafts</h3>
          <div className="flex flex-wrap gap-2">
            {drafts.map((p) => (
              <button key={p.id} onClick={() => open(postToInitial(p))} className="rounded-ui border border-border bg-surface px-3 py-2 text-left text-xs">
                <StatusBadge status="draft" /> {p.content.slice(0, 60)}
              </button>
            ))}
          </div>
        </div>
      )}

      {statusOf && (
        <PostStatusModal
          key={statusOf.id}
          post={statusOf}
          onClose={() => setStatusOf(null)}
          onEdit={() => {
            setStatusOf(null);
            open(postToInitial(statusOf));
          }}
        />
      )}

      {composer.open && (
        <PostComposerModal
          key={composer.nonce}
          open
          onClose={() => setComposer((c) => ({ ...c, open: false }))}
          accounts={accounts}
          mediaLibrary={mediaLibrary}
          initial={composer.initial}
          apiBase={apiBase}
        />
      )}
    </div>
  );
}
