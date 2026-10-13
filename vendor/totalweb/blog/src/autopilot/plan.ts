// Autopilot: schedule config, run items and the pure decisions the tick makes (timing, targets, run outcome).
// No I/O here, so it is unit-tested directly.
import { z } from "zod";
import { PLATFORM_KEYS, type PlatformKey } from "@totalweb/social/core";
import { DESC_MAX, DESC_MIN, TITLE_MAX } from "../core/seo";

export type AutopilotKind = "blog" | "social";

export const INTERVAL_PRESETS = [
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Daily" },
  { hours: 48, label: "Every 2 days" },
  { hours: 72, label: "Every 3 days" },
  { hours: 168, label: "Weekly" },
] as const;

export const LIMITS = { articlesPerRun: 5, postsPerRun: 20, videosPerRun: 3, minIntervalHours: 1, minVideoIntervalHours: 6 } as const;

export const blogConfigSchema = z.object({
  articlesPerRun: z.number().int().min(1).max(LIMITS.articlesPerRun).default(1),
  lengthWords: z.number().int().min(600).max(4000).default(1500),
  audience: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type BlogConfig = z.output<typeof blogConfigSchema>;

const platformEnum = z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]);

export const socialConfigSchema = z
  .object({
    accountIds: z.array(z.string().uuid()).min(1, "Pick at least one account to post to"),
    /** Posts of each type per run; each one goes to every chosen account whose platform supports it. */
    counts: z.object({
      text: z.number().int().min(0).max(LIMITS.postsPerRun).default(0),
      image: z.number().int().min(0).max(LIMITS.postsPerRun).default(0),
      video: z.number().int().min(0).max(LIMITS.videosPerRun).default(0),
    }),
    videoSpec: z.object({ aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]), durationS: z.number().min(5).max(90) }).default({ aspect: "9:16", durationS: 30 }),
    goals: z.string().trim().max(1000).optional(),
  })
  .refine((c) => c.counts.text + c.counts.image + c.counts.video > 0, "Choose at least one post per run")
  .refine((c) => c.counts.text + c.counts.image + c.counts.video <= LIMITS.postsPerRun, `At most ${LIMITS.postsPerRun} posts per run`);
export type SocialConfig = z.output<typeof socialConfigSchema>;

export const scheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blog"), enabled: z.boolean(), intervalHours: z.number().int().min(1).max(720), voiceProfileId: z.string().uuid().nullish(), config: blogConfigSchema }),
  z.object({ kind: z.literal("social"), enabled: z.boolean(), intervalHours: z.number().int().min(1).max(720), voiceProfileId: z.string().uuid().nullish(), config: socialConfigSchema }),
]).refine((s) => s.kind !== "social" || !s.config.counts.video || s.intervalHours >= LIMITS.minVideoIntervalHours, {
  message: `Schedules that make videos run at most every ${LIMITS.minVideoIntervalHours} hours`,
  path: ["intervalHours"],
});
export type ScheduleInput = z.input<typeof scheduleSchema>;

export interface AutopilotSchedule {
  id: string;
  workspace_id: string;
  kind: AutopilotKind;
  enabled: boolean;
  interval_hours: number;
  next_run_at: string | null;
  last_run_at: string | null;
  voice_profile_id: string | null;
  config: Record<string, any>;
  consecutive_failures: number;
  last_error: string | null;
}

export type ItemState = "pending" | "done" | "failed" | "needs_attention" | "skipped";

/** One thing a run is waiting on: an engine job, then the drafts it produced (a video draft waits on its film). */
export interface RunItem {
  kind: "blog_job" | "social_job" | "draft";
  ref: string;
  state: ItemState;
  label?: string;
  postId?: string;
  at?: string;
  error?: string;
  /** Video drafts: the director project, and whether a failed step was already retried. */
  videoProjectId?: string;
  retried?: boolean;
}

export interface AutopilotRun {
  id: string;
  workspace_id: string;
  schedule_id: string;
  kind: AutopilotKind;
  status: "running" | "done" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  ends_at: string;
  config: Record<string, any>;
  voice_profile_id: string | null;
  items: RunItem[];
  error: string | null;
}

/** The engine's plan rows for a social config: one row per post type, on the platforms that type can go to. */
export function postPlanFor(config: SocialConfig, platforms: PlatformKey[], supports: (p: PlatformKey, t: "text" | "image" | "video") => boolean) {
  return (["text", "image", "video"] as const)
    .map((type) => ({ type, count: config.counts[type], platforms: [...new Set(platforms)].filter((p) => supports(p, type)) }))
    .filter((r) => r.count > 0 && r.platforms.length > 0);
}

/** Go-live time of item `i` of `n` spread over [start, end): the first goes out at the start. */
export function spreadTime(start: Date, end: Date, i: number, n: number): Date {
  const span = Math.max(0, end.getTime() - start.getTime());
  return new Date(start.getTime() + (n > 0 ? (span * i) / n : 0));
}

/** The engine's suggested time, kept inside [earliest, latest]; no suggestion → the fallback. */
export function clampTime(suggested: string | null | undefined, earliest: Date, latest: Date, fallback: Date): Date {
  const t = suggested ? new Date(suggested) : null;
  if (!t || Number.isNaN(t.getTime())) return new Date(Math.min(Math.max(fallback.getTime(), earliest.getTime()), Math.max(latest.getTime(), earliest.getTime())));
  if (t < earliest) return earliest;
  if (t > latest && latest > earliest) return latest;
  return t;
}

/** Chosen accounts that can take a draft for `platform`. */
export function targetAccounts<A extends { id: string; platform: string; status: string }>(accounts: A[], accountIds: string[], platform: string): A[] {
  return accounts.filter((a) => accountIds.includes(a.id) && a.platform === platform && a.status === "active");
}

/** Copy + hashtags, as the composer does for a generated draft. */
export function draftText(d: { content: string; hashtags?: string[] | null }) {
  const tags = (d.hashtags ?? []).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`));
  return tags.length ? `${d.content}\n\n${tags.join(" ")}` : d.content;
}

const FINAL: ItemState[] = ["done", "failed", "needs_attention", "skipped"];
export const isFinal = (s: ItemState) => FINAL.includes(s);

/**
 * The run's outcome once nothing is pending (null while it isn't): `done` when everything published, `failed` when
 * nothing did, else `partial`. Job items only count through the drafts/posts they produced.
 */
export function runOutcome(items: RunItem[], expectedBlogJobs = 0): AutopilotRun["status"] | null {
  if (items.some((i) => !isFinal(i.state))) return null;
  if (items.filter((i) => i.kind === "blog_job").length < expectedBlogJobs && !items.some((i) => i.kind === "blog_job" && i.state === "failed")) return null;
  const outputs = items.filter((i) => i.kind !== "social_job");
  const jobsFailed = items.some((i) => i.kind === "social_job" && i.state === "failed");
  if (!outputs.length) return "failed";
  const ok = outputs.filter((i) => i.state === "done").length;
  if (ok === 0) return "failed";
  return ok === outputs.length && !jobsFailed ? "done" : "partial";
}

/** Cut at a word boundary to at most `max` characters. */
function clip(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}

/**
 * Fills SEO gaps an article can be published with unattended: SEO title and meta description derived from the
 * title/excerpt/body, stray H1s demoted. Returns only the fields to change.
 */
export function autoFixSeo(p: { title: string; body_md: string; excerpt?: string | null; seo_title?: string | null; meta_description?: string | null }) {
  const out: { seo_title?: string; meta_description?: string; body_md?: string } = {};
  const title = (p.seo_title || p.title).trim();
  if (title.length > TITLE_MAX) out.seo_title = clip(title, TITLE_MAX);
  const desc = (p.meta_description ?? "").trim();
  if (desc.length < DESC_MIN || desc.length > DESC_MAX) {
    const plain = (s: string) => s.replace(/^#+ .*$/gm, "").replace(/[*_`>#]|\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
    const source = [desc, p.excerpt ?? "", plain(p.body_md)].map((s) => s.trim()).find((s) => s.length >= DESC_MIN) ?? "";
    if (source) out.meta_description = clip(source, DESC_MAX - 5);
  }
  if (/^# /m.test(p.body_md)) out.body_md = p.body_md.replace(/^# /gm, "## ");
  return out;
}
