"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Badge, Button, EmptyState, LocalTime, Modal } from "@totalweb/ui";
import {
  GENERATED_FILTERS,
  GENERATED_STATE_LABEL,
  PLATFORMS,
  POST_TYPES,
  type GeneratedFilter,
  type GeneratedState,
  type PlatformKey,
  type PostType,
} from "../core/index.ts";
import { rejectDraft, restoreDraft } from "../server/actions";
import type { Account, GeneratedPost, MediaAsset, Post } from "../types";
import { draftToComposer } from "./draftComposer";
import { LiveDevicePreview } from "./LiveDevicePreview";
import { PostComposerModal, type ComposerInitial } from "./PostComposerModal";
import { PostStatusModal } from "./PostStatus";
import { PlatformChip, Usd, fmtSeconds } from "./shared";

export interface GeneratedFilters {
  status?: GeneratedFilter | null;
  platform?: PlatformKey | null;
  type?: PostType | null;
}

const STATE_TONE: Record<GeneratedState, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  review: "primary",
  draft: "neutral",
  scheduled: "primary",
  publishing: "warning",
  published: "success",
  failed: "danger",
  rejected: "neutral",
};


const withTags = (p: GeneratedPost) =>
  p.content + (p.hashtags.length ? `\n\n${p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "");

/** The most relevant moment for a post's state, with its label (an ISO time: render it with LocalTime). */
function keyTime(p: GeneratedPost): [string, string] | null {
  const published = p.target?.published_at ?? p.post?.published_at;
  if (p.state === "published" && published) return ["Published", published];
  if ((p.state === "scheduled" || p.state === "publishing") && p.post?.scheduled_at) return ["Scheduled", p.post.scheduled_at];
  if ((p.state === "review" || p.state === "draft") && p.suggested_at) return ["Suggested", p.suggested_at];
  return ["Generated", p.created_at];
}

/**
 * Every AI-generated post, filterable by publish status, platform and post type. Compact cards (media first,
 * title, three-line excerpt) open a detail view with the full platform preview, a proper media player, and actions.
 * Filters live in the URL (?status=&platform=&type=) so a filtered view can be shared or bookmarked.
 */
export function GeneratedPostsGallery({
  posts,
  media,
  accounts,
  mediaLibrary,
  brandName,
  initialFilters,
  calendarHref,
  videosHref,
  apiBase,
}: {
  posts: GeneratedPost[];
  media: MediaAsset[];
  accounts: Account[];
  mediaLibrary: MediaAsset[];
  brandName: string;
  initialFilters?: GeneratedFilters;
  calendarHref?: string;
  /** The Videos tab, for drafts whose film is still being proposed/approved/built. */
  videosHref?: string;
  apiBase?: string;
}) {
  const [filters, setFilters] = useState<GeneratedFilters>(initialFilters ?? {});
  const [openId, setOpenId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerInitial | null>(null);
  const [statusOf, setStatusOf] = useState<Post | null>(null);
  const [pending, start] = useTransition();
  const mediaById = useMemo(() => new Map([...mediaLibrary, ...media].map((m) => [m.id, m])), [media, mediaLibrary]);

  function update(patch: GeneratedFilters) {
    const next = { ...filters, ...patch };
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const key of ["status", "platform", "type"] as const) {
      if (next[key]) params.set(key, next[key]!);
      else params.delete(key);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }

  const statesFor = (f: GeneratedFilter) => GENERATED_FILTERS.find((g) => g.key === f)!.states;
  const matches = (p: GeneratedPost, f: GeneratedFilters) =>
    (!f.status || statesFor(f.status).includes(p.state)) &&
    (!f.platform || p.platform === f.platform) &&
    (!f.type || p.post_type === f.type);

  // Each facet counts with the other two filters applied, so the numbers always match what a click would show.
  const count = (patch: GeneratedFilters) => posts.filter((p) => matches(p, { ...filters, ...patch })).length;
  const platforms = [...new Set(posts.map((p) => p.platform))].sort();
  const types = POST_TYPES.filter((t) => posts.some((p) => p.post_type === t.key));

  const visible = useMemo(() => {
    const list = posts.filter((p) => matches(p, filters));
    const time = (p: GeneratedPost) => p.post?.scheduled_at ?? p.suggested_at ?? p.created_at;
    if (filters.status === "scheduled") return [...list].sort((a, b) => time(a).localeCompare(time(b)));
    if (filters.status === "published") {
      const at = (p: GeneratedPost) => p.target?.published_at ?? p.post?.published_at ?? p.created_at;
      return [...list].sort((a, b) => at(b).localeCompare(at(a)));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, filters]);

  const account = (platform: PlatformKey) => accounts.find((a) => a.platform === platform && a.status === "active");
  const assetsOf = (p: GeneratedPost) => p.media_ids.map((id) => mediaById.get(id)).filter(Boolean) as MediaAsset[];
  const filtered = Boolean(filters.status || filters.platform || filters.type);

  const openIndex = visible.findIndex((p) => p.id === openId);
  const open = openIndex >= 0 ? visible[openIndex] : null;
  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0) return;
      const next = visible[openIndex + delta];
      if (next) setOpenId(next.id);
    },
    [openIndex, visible],
  );

  const actions = (p: GeneratedPost, compact: boolean) => (
    <>
      {p.target?.external_url && (
        <a href={p.target.external_url} target="_blank" rel="noreferrer" className="relative z-10 text-sm text-primary underline-offset-2 hover:underline">
          View live post
        </a>
      )}
      {p.state === "review" && (
        <>
          <Button size="sm" variant="ghost" className="relative z-10" disabled={pending} onClick={() => start(() => rejectDraft(p.id))}>
            Reject
          </Button>
          <Button
            size="sm"
            className="relative z-10"
            onClick={() => {
              setOpenId(null);
              setComposer(draftToComposer(p, accounts));
            }}
          >
            {compact ? "Schedule" : "Review & schedule"}
          </Button>
        </>
      )}
      {p.state === "rejected" && (
        <Button size="sm" variant="secondary" className="relative z-10" disabled={pending} onClick={() => start(() => restoreDraft(p.id))}>
          Restore to review
        </Button>
      )}
      {p.post && ["scheduled", "publishing", "published", "failed"].includes(p.state) && (
        <Button
          size="sm"
          variant="secondary"
          className="relative z-10"
          onClick={() => {
            setOpenId(null);
            // PostStatusView loads the targets itself; this row only seeds the header.
            setStatusOf({
              id: p.post!.id,
              status: p.post!.status,
              content: p.content,
              title: p.title,
              link: null,
              media_ids: p.media_ids,
              tags: [],
              scheduled_at: p.post!.scheduled_at,
              published_at: p.post!.published_at,
              topic: null,
              format: null,
              source: "ai",
              targets: [],
            });
          }}
        >
          Status
        </Button>
      )}
      {calendarHref && p.post && p.state !== "published" && (
        <a
          href={`${calendarHref}?month=${(p.post.scheduled_at ?? p.suggested_at ?? p.created_at).slice(0, 7)}`}
          className="relative z-10 text-sm text-primary underline-offset-2 hover:underline"
        >
          Open in calendar
        </a>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-ui border border-border bg-surface p-3">
        <FilterRow label="Status">
          <Chip on={!filters.status} onClick={() => update({ status: null })} count={count({ status: null })}>
            All
          </Chip>
          {GENERATED_FILTERS.map((g) => (
            <Chip key={g.key} on={filters.status === g.key} onClick={() => update({ status: g.key })} count={count({ status: g.key })}>
              {g.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Platform">
          <Chip on={!filters.platform} onClick={() => update({ platform: null })} count={count({ platform: null })}>
            All
          </Chip>
          {platforms.map((p) => (
            <Chip key={p} on={filters.platform === p} onClick={() => update({ platform: p })} count={count({ platform: p })} color={PLATFORMS[p].color}>
              {PLATFORMS[p].name}
            </Chip>
          ))}
        </FilterRow>
        {types.length > 1 && (
          <FilterRow label="Type">
            <Chip on={!filters.type} onClick={() => update({ type: null })} count={count({ type: null })}>
              All
            </Chip>
            {types.map((t) => (
              <Chip key={t.key} on={filters.type === t.key} onClick={() => update({ type: t.key })} count={count({ type: t.key })}>
                {t.label}
              </Chip>
            ))}
          </FilterRow>
        )}
        <div className="flex items-center justify-between text-xs text-muted">
          <span aria-live="polite">
            {visible.length} of {posts.length} generated post{posts.length === 1 ? "" : "s"}
          </span>
          {filtered && (
            <button type="button" className="underline-offset-2 hover:text-fg hover:underline" onClick={() => update({ status: null, platform: null, type: null })}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <EmptyState title="No generated posts yet">Generate posts in the AI studio; every draft shows up here with its status.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing matches these filters">Try another status or platform.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((p) => {
            const time = keyTime(p);
            const heading = p.title || p.idea?.title || p.idea?.hook;
            return (
              <article
                key={p.id}
                // Preview videos on hover (the stretched link covers the video itself).
                onMouseEnter={(e) => void e.currentTarget.querySelector("video")?.play().catch(() => {})}
                onMouseLeave={(e) => e.currentTarget.querySelector("video")?.pause()}
                className="group relative flex flex-col overflow-hidden rounded-ui border border-border bg-surface transition hover:border-primary/60 focus-within:border-primary"
              >
                <Thumb post={p} assets={assetsOf(p)} />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {heading && (
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                      {/* Stretched link: the whole card opens the detail view; action buttons sit above it (z-10). */}
                      <button type="button" className="text-left after:absolute after:inset-0 focus:outline-none" onClick={() => setOpenId(p.id)}>
                        {heading}
                      </button>
                    </h3>
                  )}
                  <p className="line-clamp-3 whitespace-pre-line text-xs text-muted">
                    {!heading && (
                      <button type="button" className="text-left after:absolute after:inset-0 focus:outline-none" onClick={() => setOpenId(p.id)}>
                        <span className="sr-only">Open post: </span>
                      </button>
                    )}
                    {p.content}
                  </p>
                  {time && (
                    <p className="text-xs">
                      <span className="text-muted">{time[0]} </span>
                      <LocalTime value={time[1]} />
                    </p>
                  )}
                  {p.video_project && p.video_project.status !== "done" && (
                    <a href={`${videosHref ?? ""}?project=${p.video_project.id}`} className="relative z-10 text-xs font-medium text-primary underline-offset-2 hover:underline">
                      {p.video_project.status === "proposed" ? "Video script ready: review & approve →" : p.video_project.status === "failed" ? "Video failed: open →" : "Video in the works: open →"}
                    </a>
                  )}
                  {p.cost.video_usd != null && (
                    <p className="text-xs" title="OpenAI cost of making this video, start to end">
                      <span className="text-muted">Video cost </span>
                      <span className="tabular-nums">
                        <Usd n={p.cost.video_usd} />
                      </span>
                      {p.cost.video_seconds != null && <span className="text-muted"> · {fmtSeconds(p.cost.video_seconds)}</span>}
                    </p>
                  )}
                  {p.state === "failed" && p.target?.error && <p className="line-clamp-2 text-xs text-danger">{p.target.error}</p>}
                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">{actions(p, true)}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <PostDetail
          key={open.id}
          post={open}
          assets={assetsOf(open)}
          accountName={account(open.platform)?.name ?? brandName}
          avatarUrl={account(open.platform)?.avatar_url ?? null}
          position={`${openIndex + 1} / ${visible.length}`}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => step(-1) : undefined}
          onNext={openIndex < visible.length - 1 ? () => step(1) : undefined}
          actions={actions(open, false)}
        />
      )}

      {statusOf && <PostStatusModal key={statusOf.id} post={statusOf} onClose={() => setStatusOf(null)} />}

      {composer && (
        <PostComposerModal open onClose={() => setComposer(null)} accounts={accounts} mediaLibrary={[...mediaById.values()]} initial={composer} apiBase={apiBase} />
      )}
    </div>
  );
}

/** Card media: the image or the video's first frame (plays muted on hover), a typographic tile for text posts. */
function Thumb({ post, assets }: { post: GeneratedPost; assets: MediaAsset[] }) {
  const first = assets[0];
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
      {first?.kind === "video" ? (
        <>
          <video
            src={first.url ? `${first.url}#t=0.5` : undefined}
            className="h-full w-full bg-black object-contain"
            muted
            loop
            playsInline
            preload="metadata"
          />
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/60 text-lg text-white transition group-hover:opacity-0">▶</span>
          </span>
        </>
      ) : first ? (
        <img src={first.url ?? undefined} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full items-center p-4" style={{ background: `linear-gradient(135deg, ${PLATFORMS[post.platform].color}22, transparent)` }}>
          <p className="line-clamp-5 text-sm font-medium leading-snug">{post.content}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        <Badge tone={STATE_TONE[post.state]} className="shadow-sm backdrop-blur">
          {GENERATED_STATE_LABEL[post.state]}
        </Badge>
        <span className="rounded-full bg-bg/85 backdrop-blur">
          <PlatformChip platform={post.platform} />
        </span>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] backdrop-blur">
        {POST_TYPES.find((t) => t.key === post.post_type)?.label}
      </span>
    </div>
  );
}

/** Full view of one post: a proper media player or the in-feed preview, details, and actions; ←/→ to browse. */
function PostDetail({
  post,
  assets,
  accountName,
  avatarUrl,
  position,
  onClose,
  onPrev,
  onNext,
  actions,
}: {
  post: GeneratedPost;
  assets: MediaAsset[];
  accountName: string;
  avatarUrl: string | null;
  position: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  actions: React.ReactNode;
}) {
  const first = assets[0];
  const [view, setView] = useState<"media" | "feed">(first ? "media" : "feed");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, video")) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  const time = keyTime(post);
  return (
    <Modal open onClose={onClose} title={post.title || post.idea?.title || `${PLATFORMS[post.platform].name} post`} wide>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          {first && (
            <div className="inline-flex rounded-full border border-border p-0.5 text-xs" role="tablist" aria-label="Preview mode">
              {(["media", "feed"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-full px-3 py-1 ${view === v ? "bg-primary text-primary-fg" : "text-muted hover:text-fg"}`}
                >
                  {v === "media" ? (first.kind === "video" ? "Video" : "Image") : "Feed preview"}
                </button>
              ))}
            </div>
          )}
          {view === "media" && first ? (
            <div className="space-y-2">
              <div className="flex justify-center overflow-hidden rounded-ui bg-black">
                {first.kind === "video" ? (
                  <video src={first.url ?? undefined} className="max-h-[70vh] w-auto max-w-full" controls playsInline preload="metadata" />
                ) : (
                  <img src={first.url ?? undefined} alt="" className="max-h-[70vh] w-auto max-w-full object-contain" />
                )}
              </div>
              {first.url && (
                <p className="text-right text-xs">
                  <a href={first.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                    Open full size
                  </a>
                </p>
              )}
            </div>
          ) : (
            <div className="max-h-[75vh] overflow-y-auto">
              <LiveDevicePreview
                platform={post.platform}
                text={withTags(post)}
                title={post.title}
                media={assets}
                accountName={accountName}
                avatarUrl={avatarUrl}
                fold
              />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATE_TONE[post.state]}>{GENERATED_STATE_LABEL[post.state]}</Badge>
            <PlatformChip platform={post.platform} />
            <span className="text-xs text-muted">{POST_TYPES.find((t) => t.key === post.post_type)?.label}</span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {time && (
              <>
                <dt className="text-muted">{time[0]}</dt>
                <dd>
                  <LocalTime value={time[1]} />
                </dd>
              </>
            )}
            {post.idea?.topic && (
              <>
                <dt className="text-muted">Topic</dt>
                <dd>{post.idea.topic}</dd>
              </>
            )}
            {post.idea?.hook && (
              <>
                <dt className="text-muted">Hook</dt>
                <dd>{post.idea.hook}</dd>
              </>
            )}
            {post.cost.video_usd != null && (
              <>
                <dt className="text-muted">Video cost</dt>
                <dd className="tabular-nums">
                  <Usd n={post.cost.video_usd} />
                  {post.cost.video_seconds != null && <span className="text-muted"> · made in {fmtSeconds(post.cost.video_seconds)}</span>}
                </dd>
              </>
            )}
            {post.cost.job_usd != null && (
              <>
                <dt className="text-muted">Whole batch</dt>
                <dd className="tabular-nums" title="Research, planning, copy and every video in the generation this post came from">
                  <Usd n={post.cost.job_usd} />
                </dd>
              </>
            )}
            <dt className="text-muted">Length</dt>
            <dd>
              {[...withTags(post)].length} / {PLATFORMS[post.platform].charLimit} characters
            </dd>
          </dl>

          {post.state === "failed" && post.target?.error && <p className="rounded-ui bg-danger/10 p-2 text-xs text-danger">{post.target.error}</p>}

          <section>
            <h3 className="mb-1 text-xs font-medium text-muted">Caption</h3>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-ui border border-border bg-bg p-3 text-sm">{post.content}</div>
            {post.hashtags.length > 0 && (
              <p className="mt-2 text-xs text-primary">{post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
            )}
          </section>

          {post.rationale && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Why this post</summary>
              <p className="mt-1 whitespace-pre-wrap">{post.rationale}</p>
            </details>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">{actions}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <Button size="sm" variant="ghost" disabled={!onPrev} onClick={onPrev}>
          ← Previous
        </Button>
        <span>{position}</span>
        <Button size="sm" variant="ghost" disabled={!onNext} onClick={onNext}>
          Next →
        </Button>
      </div>
    </Modal>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  count,
  color,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        on ? "border-primary bg-primary/10 text-fg" : "border-border text-muted hover:text-fg"
      }`}
    >
      {color && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
      <span className={`tabular-nums ${on ? "text-fg" : "text-muted"}`}>{count}</span>
    </button>
  );
}
