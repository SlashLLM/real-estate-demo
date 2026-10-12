"use client";

import { useEffect, useState, useTransition, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@totalweb/ui";
import { PLATFORMS, PLATFORM_KEYS, POST_TYPES, supportsPostType, type PlatformKey, type PostType } from "../core/platforms.ts";
import { rejectDraft, requestGeneration, saveBrandProfile } from "../server/actions";
import type { BrandProfile } from "../server/engine-client";
import type { Account, Draft, GenerationJob, MediaAsset } from "../types";
import { draftToComposer } from "./draftComposer";
import { MediaPicker } from "./MediaPicker";
import { PostComposerModal, type ComposerInitial } from "./PostComposerModal";
import { PlatformChip, fmt, fmtSeconds, fmtUsd } from "./shared";

/**
 * Talks to the Content Generation Engine: edit the brand profile, choose how many posts of each type
 * (image with text, video, text only) to make and where each type goes, review drafts and turn them into posts.
 */
export function AiGeneratePanel({
  brand,
  workspaceName,
  jobs,
  drafts,
  accounts,
  mediaLibrary,
  apiBase,
  generatedHref,
  videosHref,
}: {
  brand: BrandProfile | null;
  workspaceName: string;
  jobs: GenerationJob[];
  drafts: Draft[];
  accounts: Account[];
  mediaLibrary: MediaAsset[];
  apiBase?: string;
  /** Link to the Generated tab (every draft with its publish status). */
  generatedHref?: string;
  /** Link to the Videos tab, where a video draft's film is proposed, approved and built. */
  videosHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState(!brand?.niche);
  const connected = [...new Set(accounts.map((a) => a.platform))];
  const [plan, setPlan] = useState<Record<PostType, { count: number; platforms: PlatformKey[] }>>(() => {
    const defaults = (type: PostType, count: number) => {
      const supported = PLATFORM_KEYS.filter((p) => supportsPostType(p, type));
      const mine = supported.filter((p) => connected.includes(p));
      return { count, platforms: mine.length ? mine : supported.slice(0, 1) };
    };
    return { image: defaults("image", 2), video: defaults("video", 1), text: defaults("text", 2) };
  });
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const wantVideo = plan.video.count > 0 && plan.video.platforms.length > 0;
  const rows = POST_TYPES.map((t) => ({ ...t, ...plan[t.key] })).filter((r) => r.count > 0 && r.platforms.length > 0);
  const totalDrafts = rows.reduce((n, r) => n + r.count * r.platforms.length, 0);
  const setRow = (type: PostType, patch: Partial<{ count: number; platforms: PlatformKey[] }>) =>
    setPlan((s) => ({ ...s, [type]: { ...s[type], ...patch } }));
  const [composer, setComposer] = useState<ComposerInitial | null>(null);

  // Poll while a job is running; the engine callback writes results to the DB.
  const running = jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [running, router]);

  const latestInsights = jobs.find((j) => j.insights)?.insights;

  function approve(d: Draft) {
    setComposer(draftToComposer(d, accounts));
  }

  return (
    <div className="space-y-6">
      {/* Brand profile */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Brand profile</h2>
          {!editingBrand && (
            <Button size="sm" variant="ghost" onClick={() => setEditingBrand(true)}>
              Edit
            </Button>
          )}
        </div>
        {editingBrand ? (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            action={(fd) =>
              start(async () => {
                setError(null);
                try {
                  await saveBrandProfile({
                    name: String(fd.get("name")),
                    niche: String(fd.get("niche")),
                    description: String(fd.get("description") || ""),
                    voice: String(fd.get("voice") || ""),
                    website: String(fd.get("website") || ""),
                    audience: String(fd.get("audience") || ""),
                    locale: String(fd.get("locale") || "en"),
                    known_competitors: String(fd.get("known_competitors") || "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  });
                  setEditingBrand(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              })
            }
          >
            <Field name="name" label="Brand name" defaultValue={brand?.name ?? workspaceName} required />
            <Field name="niche" label="Niche / industry" defaultValue={brand?.niche} placeholder="e.g. specialty coffee roaster" required />
            <Field name="website" label="Website" defaultValue={brand?.website} placeholder="https://" />
            <Field name="audience" label="Audience" defaultValue={brand?.audience} placeholder="e.g. home baristas 25-40" />
            <Field name="voice" label="Voice" defaultValue={brand?.voice} placeholder="e.g. warm, nerdy, no hype" />
            <Field name="locale" label="Language" defaultValue={brand?.locale ?? "en"} />
            <div className="sm:col-span-2">
              <Label htmlFor="description">What you offer</Label>
              <Textarea id="description" name="description" defaultValue={brand?.description} rows={3} />
            </div>
            <div className="sm:col-span-2">
              <Field name="known_competitors" label="Known competitors (comma separated)" defaultValue={brand?.known_competitors?.join(", ")} />
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={pending}>
                Save profile
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">
            <span className="text-fg">{brand?.name}</span> · {brand?.niche}
            {brand?.audience && ` · for ${brand.audience}`}
          </p>
        )}
      </Card>

      {/* Request */}
      <Card>
        <h2 className="font-medium">Generate posts</h2>
        <p className="mt-1 text-sm text-muted">
          The engine studies your post history and stats, researches competitors and trends, then drafts posts for each platform.
        </p>
        <form
          className="mt-4 space-y-4"
          action={(fd) =>
            start(async () => {
              setError(null);
              try {
                await requestGeneration({
                  postPlan: POST_TYPES.map((t) => ({ type: t.key, ...plan[t.key] })),
                  goals: String(fd.get("goals") || ""),
                  mediaIds,
                  videoSpec: wantVideo
                    ? { aspect: fd.get("aspect") as "9:16", durationS: Number(fd.get("duration") || 15) }
                    : undefined,
                });
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">What to make</legend>
            {POST_TYPES.map((t) => {
              const row = plan[t.key];
              return (
                <div key={t.key} className="grid gap-3 rounded-ui border border-border p-3 sm:grid-cols-[180px_90px_1fr] sm:items-start">
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted">{t.description}</p>
                  </div>
                  <label className="text-xs text-muted">
                    How many
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={row.count}
                      onChange={(e) => setRow(t.key, { count: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
                      className="mt-1"
                      aria-label={`How many ${t.label} posts`}
                    />
                  </label>
                  <div>
                    <p className="text-xs text-muted">Post to</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {PLATFORM_KEYS.map((p) => {
                        const supported = supportsPostType(p, t.key);
                        const on = supported && row.platforms.includes(p);
                        return (
                          <button
                            type="button"
                            key={p}
                            disabled={!supported || row.count === 0}
                            aria-pressed={on}
                            title={supported ? (connected.includes(p) ? undefined : `${PLATFORMS[p].name} isn't connected yet`) : `${PLATFORMS[p].name} doesn't support ${t.label.toLowerCase()} posts`}
                            onClick={() => setRow(t.key, { platforms: on ? row.platforms.filter((x) => x !== p) : [...row.platforms, p] })}
                            className={`rounded-full border px-3 py-1 text-xs disabled:cursor-not-allowed ${
                              !supported ? "border-border line-through opacity-30" : on ? "border-primary bg-primary/10" : "border-border opacity-60"
                            }`}
                          >
                            {PLATFORMS[p].name}
                            {supported && !connected.includes(p) && <span className="ml-1 text-muted">·</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">
              {rows.length
                ? `${totalDrafts} draft${totalDrafts === 1 ? "" : "s"}: ` +
                  rows.map((r) => `${r.count} ${r.label.toLowerCase()} × ${r.platforms.length} platform${r.platforms.length === 1 ? "" : "s"}`).join(" · ")
                : "Set a count and at least one platform for one of the post types."}
            </p>
          </fieldset>
          <Field name="goals" label="Goal for this batch (optional)" placeholder="e.g. promote the autumn blend launch, drive newsletter signups" />
          <div>
            <Label>Attach media for the engine to use (product shots, clips, logo)</Label>
            <MediaPicker library={mediaLibrary} selected={mediaIds} onChange={setMediaIds} apiBase={apiBase} />
          </div>
          {wantVideo && (
            <p className="text-xs text-muted">
              Each video post opens a project in the <a className="text-primary underline" href={`${generatedHref?.replace(/\/generated$/, "") ?? ""}/videos`}>Videos tab</a>: the director
              researches your product and proposes three concepts and a script, and the film is built from your real screens once you approve.
            </p>
          )}
          {wantVideo && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">
                Aspect
                <Select name="aspect" className="mt-1" defaultValue="9:16">
                  <option value="9:16">9:16 (Reels, TikTok, Shorts)</option>
                  <option value="1:1">1:1 (feed)</option>
                  <option value="4:5">4:5 (portrait feed)</option>
                  <option value="16:9">16:9 (YouTube, LinkedIn)</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                Duration
                <Select name="duration" className="mt-1" defaultValue="15">
                  {[6, 15, 30, 60].map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || running || !rows.length || !brand?.niche}>
              {running ? "Generating…" : "Generate"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Live progress of running jobs (refreshed every 5 s from the engine) */}
      {jobs
        .filter((j) => j.status === "queued" || j.status === "running")
        .map((j) => (
          <JobProgress key={j.id} job={j} />
        ))}

      {/* Only the current job: when nothing is running, the outcome of the latest one */}
      {!running && jobs[0] && jobs[0].status === "failed" && (
        <Card className="text-sm">
          <Badge tone="danger">failed</Badge> <span className="text-muted">{new Date(jobs[0].created_at).toLocaleString()}</span>
          {jobs[0].error && <p className="mt-1 text-danger">{jobs[0].error}</p>}
        </Card>
      )}
      {!running && jobs[0]?.insights?.cost && <CostCard job={jobs[0]} />}

      {latestInsights && <InsightsCard insights={latestInsights} />}

      {/* Drafts */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Drafts to review</h2>
          {generatedHref && (
            <a href={generatedHref} className="text-sm text-primary underline-offset-2 hover:underline">
              All generated posts →
            </a>
          )}
        </div>
        {drafts.length === 0 ? (
          <EmptyState title="No drafts waiting">Generated posts show up here for approval.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.map((d) => {
              const media = d.media_ids.map((id) => mediaLibrary.find((m) => m.id === id)).filter(Boolean) as MediaAsset[];
              return (
                <Card key={d.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <PlatformChip platform={d.platform} />
                      {(d.idea?.post_type ?? d.idea?.format) && (
                        <Badge>{POST_TYPES.find((t) => t.key === (d.idea?.post_type ?? d.idea?.format))?.label ?? d.idea?.format}</Badge>
                      )}
                    </span>
                    {d.suggested_at && <span className="text-xs text-muted">Suggested {new Date(d.suggested_at).toLocaleString()}</span>}
                  </div>
                  {d.title && <p className="font-medium">{d.title}</p>}
                  <p className="whitespace-pre-wrap text-sm">{d.content}</p>
                  {d.hashtags.length > 0 && <p className="text-xs text-primary">{d.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>}
                  {media.length > 0 && (
                    <div className="flex gap-2">
                      {media.map((m) =>
                        m.kind === "video" ? (
                          <video key={m.id} src={m.url ? `${m.url}#t=1` : undefined} className="h-28 rounded-ui" controls muted playsInline preload="metadata" />
                        ) : (
                          <img key={m.id} src={m.url ?? undefined} alt="" className="h-28 rounded-ui object-cover" />
                        ),
                      )}
                    </div>
                  )}
                  {d.rationale && (
                    <details className="text-xs text-muted">
                      <summary className="cursor-pointer">Why this post</summary>
                      <p className="mt-1 whitespace-pre-wrap">{d.rationale}</p>
                    </details>
                  )}
                  {filmPending(d) && (
                    <p className="rounded-ui bg-surface-2 px-3 py-2 text-xs">
                      <Badge tone={d.video_project?.status === "failed" ? "danger" : "warning"}>Video</Badge>{" "}
                      {VIDEO_STEP[d.video_project?.status ?? ""] ?? "The film has not started yet."}
                    </p>
                  )}
                  <div className="mt-auto flex justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => rejectDraft(d.id))}>
                      Reject
                    </Button>
                    {filmPending(d) ? (
                      <a
                        href={`${videosHref ?? ""}${d.video_project ? `?project=${d.video_project.id}` : ""}`}
                        className="inline-flex items-center rounded-ui bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg"
                      >
                        {d.video_project?.status === "proposed" ? "Review video script" : "Open in Videos"}
                      </a>
                    ) : (
                      <Button size="sm" onClick={() => approve(d)}>
                        Review & schedule
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {composer && (
        <PostComposerModal open onClose={() => setComposer(null)} accounts={accounts} mediaLibrary={mediaLibrary} initial={composer} apiBase={apiBase} />
      )}
    </div>
  );
}

/** What a video draft's film is doing (its director project), shown instead of scheduling an empty post. */
const VIDEO_STEP: Record<string, string> = {
  proposing: "Researching the site and writing three concepts…",
  proposed: "The proposal is ready: pick a concept, edit the script and approve it to build the film.",
  building: "Building the film…",
  failed: "The video failed. Open it in Videos to see why and retry.",
};

/** A video post whose film is not attached yet: it can't be scheduled until the film is built. */
const filmPending = (d: Draft) => (d.idea?.post_type ?? d.idea?.format) === "video" && !d.media_ids?.length;

function JobProgress({ job }: { job: GenerationJob }) {
  const pct = job.progress == null ? null : Math.round(job.progress * 100);
  const started = new Date(job.created_at);
  const minutes = Math.max(0, Math.round((Date.now() - started.getTime()) / 60000));
  const plan = (job.request?.postPlan ?? []) as { type: string; count: number }[];
  return (
    <Card aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{job.status === "queued" ? "Queued" : "Generating"}</span>
        <span className="text-muted">
          {pct != null && `${pct}% · `}
          {minutes < 1 ? "just started" : `${minutes} min`}
          {job.cost_usd != null && (
            <span className="tabular-nums text-fg" title="OpenAI cost so far (voice, music, rendering and research run locally)">
              {" "}
              · {fmtUsd(job.cost_usd)} so far
            </span>
          )}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{job.stage ? job.stage.charAt(0).toUpperCase() + job.stage.slice(1) : "Starting…"}</p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        <div
          className={`h-full rounded-full bg-primary transition-[width] duration-700 ${pct == null ? "w-1/3 animate-pulse" : ""}`}
          style={pct == null ? undefined : { width: `${Math.max(3, pct)}%` }}
        />
      </div>
      {plan.some((r) => r.count > 0) && (
        <p className="mt-2 text-xs text-muted">
          {plan
            .filter((r) => r.count > 0)
            .map((r) => `${r.count} ${POST_TYPES.find((t) => t.key === r.type)?.label.toLowerCase() ?? r.type}`)
            .join(" · ")}
          {plan.some((r) => r.type === "video" && r.count > 0) && " · videos take several minutes each"}
        </p>
      )}
    </Card>
  );
}

function Field({ name, label, ...props }: { name: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  "topic tagging": "Tagging past posts",
  research: "Research (site, competitors, trends)",
  planning: "Planning ideas",
  copywriting: "Writing copy",
};

/** What the latest finished generation cost, start to end: per stage and per video (with production time). */
function CostCard({ job }: { job: GenerationJob }) {
  const cost = job.insights!.cost as {
    total_usd: number;
    seconds: number;
    stages: { stage: string; calls: number; input_tokens: number; cached_tokens: number; output_tokens: number; usd: number }[];
    videos: Record<string, { usd: number; seconds: number }>;
    unpriced_models?: string[];
  };
  const videoTitle = (id: string) =>
    (job.insights?.videos as { idea_id: string; engine?: string }[] | undefined)?.find((v) => v.idea_id === id)?.engine ?? "video";
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">Cost of the last generation</h2>
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">{fmtUsd(cost.total_usd)}</span>
          <span className="ml-2 text-muted">in {fmtSeconds(cost.seconds)}</span>
        </p>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 font-normal">Stage</th>
            <th className="py-1 text-right font-normal">Tokens (in / out)</th>
            <th className="py-1 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody>
          {cost.stages.map((s) => {
            const videoId = s.stage.startsWith("video:") ? s.stage.slice(6) : null;
            return (
              <tr key={s.stage} className="border-t border-border">
                <td className="py-1.5">
                  {videoId ? (
                    <>
                      Video <span className="text-muted">({videoTitle(videoId)}, {fmtSeconds(cost.videos[videoId]?.seconds)})</span>
                    </>
                  ) : (
                    STAGE_LABEL[s.stage] ?? s.stage
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted">
                  {fmt(s.input_tokens)} / {fmt(s.output_tokens)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{fmtUsd(s.usd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        OpenAI usage only. Voice, music, rendering and web research run on your own server.
        {cost.unpriced_models?.length ? ` No price known for ${cost.unpriced_models.join(", ")} (counted as $0).` : ""}
      </p>
    </Card>
  );
}

function InsightsCard({ insights }: { insights: Record<string, any> }) {
  return (
    <Card>
      <h2 className="font-medium">What the engine learned</h2>
      {insights.summary && <p className="mt-2 whitespace-pre-wrap text-sm">{insights.summary}</p>}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        {insights.best_formats && (
          <div>
            <p className="text-xs text-muted">Best formats</p>
            <p>{insights.best_formats.slice(0, 3).map((f: any) => f.format ?? f).join(", ")}</p>
          </div>
        )}
        {insights.best_topics && (
          <div>
            <p className="text-xs text-muted">Winning topics</p>
            <p>{insights.best_topics.slice(0, 3).map((t: any) => t.topic ?? t).join(", ")}</p>
          </div>
        )}
        {insights.best_times && (
          <div>
            <p className="text-xs text-muted">Best slots</p>
            <p>{insights.best_times.slice(0, 3).map((t: any) => t.label ?? t).join(", ")}</p>
          </div>
        )}
      </div>
      {insights.inspiration?.patterns?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted">Inspiration patterns found on the web</p>
          <ul className="mt-1 space-y-1 text-sm">
            {insights.inspiration.patterns.slice(0, 6).map((p: any) => (
              <li key={p.name}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted">
                  {" "}
                  · {p.format} · “{p.hook_pattern}”
                </span>
                {p.example_url && (
                  <a href={p.example_url} target="_blank" rel="noreferrer" className="ml-1 text-xs text-primary underline">
                    example
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {insights.website?.content_angles?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted">Angles from your website</p>
          <p className="text-sm">{insights.website.content_angles.slice(0, 5).join(" · ")}</p>
        </div>
      )}
    </Card>
  );
}
