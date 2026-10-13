// The autopilot tick (pg_cron → POST /api/autopilot/cron every 5 minutes, or "Run now"). Idempotent:
//  1. starts a run for each due schedule (asks the engine for its recommended articles / posts, in the run's voice);
//  2. moves each open run on: syncs engine jobs whose callback was missed, then publishes what came back without
//     review — articles go live spread over the interval, social drafts are scheduled at the engine's suggested time,
//     video drafts get the recommended concept approved with the default narrator voice and are posted once built;
//  3. closes runs whose items are all final, and pauses a schedule after repeated failures.
import { createAdminClient } from "@totalweb/supabase/admin";
import { supportsPostType, type PlatformKey } from "@totalweb/social/core";
import {
  approveVideoProject,
  requestGeneration,
  retryVideoProject,
  syncVideoProjects,
  upsertPost,
  voiceFor,
  withEngineProgress,
} from "@totalweb/social/server";
import { autoPublishPost, requestArticle, withBlogProgress } from "../server/engine";
import { publicWorkspaceId } from "../server/env";
import {
  blogConfigSchema,
  clampTime,
  draftText,
  postPlanFor,
  runOutcome,
  socialConfigSchema,
  spreadTime,
  targetAccounts,
  type AutopilotRun,
  type AutopilotSchedule,
  type RunItem,
} from "./plan";

const MAX_FAILURES = 3;
const STUCK_AFTER_MS = 24 * 3600e3; // past ends_at + this, pending items are given up on
const MIN_LEAD_MS = 5 * 60e3;

export interface TickSummary {
  started: number;
  advanced: number;
  closed: number;
  published: string[]; // public paths of blog posts that changed (for revalidation)
  errors: string[];
}

/**
 * Client sites share one Supabase project, so a site only runs its own workspace's schedules (TOTALWEB_WORKSPACE_ID):
 * engine callbacks then come back to the site that asked. Without it (single-site setups) every workspace is run.
 */
export async function runAutopilotTick(): Promise<TickSummary> {
  const db = createAdminClient();
  const out: TickSummary = { started: 0, advanced: 0, closed: 0, published: [], errors: [] };
  const ws = publicWorkspaceId();

  const { data: due, error } = await db.rpc("autopilot_claim_due", { batch: 5, ws });
  if (error) out.errors.push(`claim: ${error.message}`);
  for (const s of (due ?? []) as AutopilotSchedule[]) {
    try {
      if (await startRun(s)) out.started++;
    } catch (e) {
      out.errors.push(`${s.kind} schedule ${s.id}: ${(e as Error).message}`);
    }
  }

  let open = db.from("autopilot_runs").select("*").eq("status", "running");
  if (ws) open = open.eq("workspace_id", ws);
  const { data: runs } = await open.order("started_at").limit(20);
  for (const run of (runs ?? []) as AutopilotRun[]) {
    try {
      const r = await advanceRun(run, out);
      out.advanced++;
      if (r) out.closed++;
    } catch (e) {
      out.errors.push(`run ${run.id}: ${(e as Error).message}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- start

async function startRun(s: AutopilotSchedule): Promise<boolean> {
  const db = createAdminClient();
  // Never overlap: a schedule's previous run must finish first (its next_run_at has already moved on).
  const { count } = await db.from("autopilot_runs").select("id", { count: "exact", head: true }).eq("schedule_id", s.id).eq("status", "running");
  if (count) return false;

  const now = new Date();
  const { data: run, error } = await db
    .from("autopilot_runs")
    .insert({
      workspace_id: s.workspace_id,
      schedule_id: s.id,
      kind: s.kind,
      ends_at: new Date(now.getTime() + s.interval_hours * 3600e3).toISOString(),
      config: s.config,
      voice_profile_id: s.voice_profile_id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  try {
    const items: RunItem[] = [];
    if (s.kind === "blog") {
      // Articles are ordered one after another, so each engine-picked topic can avoid the ones before it.
      items.push(await orderArticle(run as AutopilotRun, []));
    } else {
      const config = socialConfigSchema.parse(s.config);
      const { data: accounts } = await db.from("social_accounts").select("id, platform, status").eq("workspace_id", s.workspace_id).in("id", config.accountIds);
      const platforms = [...new Set((accounts ?? []).filter((a) => a.status === "active").map((a) => a.platform as PlatformKey))];
      const postPlan = postPlanFor(config, platforms, supportsPostType);
      if (!postPlan.length) throw new Error("None of the chosen accounts is connected, or none supports the chosen post types");
      const jobId = await requestGeneration(s.workspace_id, null, {
        postPlan,
        goals: [config.goals, `These posts go out automatically over the next ${describeHours(s.interval_hours)}; suggest times inside that window.`]
          .filter(Boolean)
          .join("\n"),
        videoSpec: config.counts.video ? config.videoSpec : undefined,
        voiceProfileId: s.voice_profile_id,
        autopilot: { scheduleId: s.id, runId: run.id },
      });
      items.push({ kind: "social_job", ref: jobId, state: "pending", label: "Recommended posts" });
    }
    await db.from("autopilot_runs").update({ items }).eq("id", run.id);
    return true;
  } catch (e) {
    const message = (e as Error).message;
    await db.from("autopilot_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", run.id);
    await recordFailure(s.id, message);
    throw e;
  }
}

async function orderArticle(run: AutopilotRun, avoidTopics: string[]): Promise<RunItem> {
  const config = blogConfigSchema.parse(run.config);
  try {
    const jobId = await requestArticle(run.workspace_id, null, {
      lengthWords: config.lengthWords,
      audience: config.audience,
      notes: config.notes,
      voiceProfileId: run.voice_profile_id,
      avoidTopics,
      autopilot: { scheduleId: run.schedule_id, runId: run.id },
    });
    return { kind: "blog_job", ref: jobId, state: "pending", label: "Recommended article" };
  } catch (e) {
    return { kind: "blog_job", ref: crypto.randomUUID(), state: "failed", error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------------------------- advance

/** Moves one run on; returns true when it closed. */
async function advanceRun(run: AutopilotRun, out: TickSummary): Promise<boolean> {
  const items = run.kind === "blog" ? await advanceBlog(run, out) : await advanceSocial(run);

  // Give up on what's still pending long after the run's window.
  if (Date.now() > new Date(run.ends_at).getTime() + STUCK_AFTER_MS) {
    for (const i of items) if (i.state === "pending") Object.assign(i, { state: "failed", error: "Timed out" });
  }

  const db = createAdminClient();
  const expected = run.kind === "blog" ? blogConfigSchema.parse(run.config).articlesPerRun : 0;
  const status = runOutcome(items, expected);
  await db
    .from("autopilot_runs")
    .update({ items, ...(status ? { status, finished_at: new Date().toISOString() } : {}) })
    .eq("id", run.id)
    .eq("status", "running");
  if (!status) return false;
  if (status === "failed") await recordFailure(run.schedule_id, items.find((i) => i.error)?.error ?? "Nothing was published");
  else await db.from("autopilot_schedules").update({ consecutive_failures: 0, last_error: null }).eq("id", run.schedule_id);
  return true;
}

async function advanceBlog(run: AutopilotRun, out: TickSummary): Promise<RunItem[]> {
  const db = createAdminClient();
  const config = blogConfigSchema.parse(run.config);
  const items = [...run.items];
  const jobIds = items.filter((i) => i.kind === "blog_job" && i.state === "pending").map((i) => i.ref);
  if (jobIds.length) {
    const { data: jobs } = await db.from("blog_generation_jobs").select("*").in("id", jobIds);
    await withBlogProgress((jobs ?? []) as any[]); // applies finished results whose callback was missed
    // Our rows after the sync (see advanceSocial): only a stored result counts.
    const { data: stored } = await db.from("blog_generation_jobs").select("id, status, error").in("id", jobIds);
    const byId = new Map((stored ?? []).map((j) => [j.id, j]));
    for (const item of items) {
      const job = byId.get(item.ref);
      if (!job || item.state !== "pending") continue;
      if (job.status === "failed") Object.assign(item, { state: "failed", error: job.error ?? "The engine failed" });
      if (job.status !== "succeeded") continue;
      const { data: post } = await db.from("blog_posts").select("id, title, status").eq("job_id", job.id).maybeSingle();
      if (!post) continue; // delivered on the next sync
      if (post.status !== "in_review" && post.status !== "draft") {
        Object.assign(item, { state: "skipped", postId: post.id, label: post.title, error: `Already ${post.status} by hand` });
        continue;
      }
      const index = items.filter((i) => i.kind === "blog_job").indexOf(item);
      const at = spreadTime(new Date(run.started_at), new Date(run.ends_at), index, config.articlesPerRun);
      const res = await autoPublishPost(post.id, at < new Date() ? new Date() : at);
      item.postId = post.id;
      item.label = post.title;
      if (res.ok) {
        Object.assign(item, { state: "done", at: at.toISOString() });
        out.published.push(res.slug);
      } else Object.assign(item, { state: "needs_attention", error: `Left in review: ${res.reason}` });
    }
  }

  // Next article once the previous one is finished.
  const ordered = items.filter((i) => i.kind === "blog_job");
  if (ordered.length < config.articlesPerRun && !ordered.some((i) => i.state === "pending") && !ordered.some((i) => i.state === "failed" && !i.postId)) {
    const { data: done } = await db.from("blog_generation_jobs").select("request").in("id", ordered.map((i) => i.ref));
    const topics = (done ?? []).map((j: any) => j.request?.topic).filter(Boolean);
    items.push(await orderArticle(run, topics));
  }
  return items;
}

async function advanceSocial(run: AutopilotRun): Promise<RunItem[]> {
  const db = createAdminClient();
  const config = socialConfigSchema.parse(run.config);
  const items = [...run.items];

  // The generation job → one item per draft it produced.
  for (const item of items.filter((i) => i.kind === "social_job" && i.state === "pending")) {
    const { data: job } = await db.from("social_generation_jobs").select("*").eq("id", item.ref).single();
    if (job) await withEngineProgress([job as any]); // applies a finished result whose callback was missed
    // Our row, not the engine's status: the engine can be done while storing its results here failed (e.g. the
    // generated media couldn't be downloaded). The job then stays running and is retried on the next tick.
    const { data: stored } = await db.from("social_generation_jobs").select("status, error").eq("id", item.ref).maybeSingle();
    if (!stored) Object.assign(item, { state: "failed", error: "Generation job missing" });
    else if (stored.status === "failed") Object.assign(item, { state: "failed", error: stored.error ?? "The engine failed" });
    else if (stored.status === "succeeded") {
      const { data: drafts } = await db.from("social_generated_drafts").select("id, platform, idea").eq("job_id", item.ref).order("created_at");
      if (!drafts) continue; // results still being stored
      for (const d of drafts) items.push({ kind: "draft", ref: d.id, state: "pending", label: d.idea?.title ?? d.platform });
      item.state = "done";
    }
  }

  const pending = items.filter((i) => i.kind === "draft" && i.state === "pending");
  if (!pending.length) return items;

  const { data: drafts } = await db.from("social_generated_drafts").select("*").in("id", pending.map((i) => i.ref));
  const draftById = new Map((drafts ?? []).map((d: any) => [d.id, d]));
  const { data: accounts } = await db.from("social_accounts").select("id, platform, status").eq("workspace_id", run.workspace_id);
  const { data: projectRows } = await db.from("social_video_projects").select("id, draft_id").in("draft_id", pending.map((i) => i.ref));
  const projects = new Map(
    (await syncVideoProjects((projectRows ?? []).map((p: any) => p.id))).map((p) => [p.draft_id as string, p]),
  );
  const voice = await voiceFor(run.workspace_id, run.voice_profile_id);
  const start = new Date(run.started_at);
  const end = new Date(run.ends_at);
  const drafted = items.filter((i) => i.kind === "draft");

  for (const item of pending) {
    const d = draftById.get(item.ref);
    if (!d) {
      Object.assign(item, { state: "skipped", error: "Draft deleted" });
      continue;
    }
    if (d.status !== "pending") {
      Object.assign(item, { state: "skipped", error: `Draft was ${d.status} by hand`, postId: d.post_id ?? undefined });
      continue;
    }
    const targets = targetAccounts(accounts ?? [], config.accountIds, d.platform);
    if (!targets.length) {
      Object.assign(item, { state: "skipped", error: `No connected ${d.platform} account chosen` });
      continue;
    }

    let mediaIds: string[] = d.media_ids ?? [];
    let content = draftText(d);
    if (d.idea?.video_status === "needs_proposal") {
      const p = projects.get(d.id);
      if (!p) {
        Object.assign(item, { state: "failed", error: "The video could not be started" });
        continue;
      }
      item.videoProjectId = p.id;
      if (p.status === "proposed") {
        const t = p.proposal?.treatment;
        const concept = t?.concepts?.find((c: any) => c.key === t.recommended) ?? t?.concepts?.[0];
        if (!concept) {
          Object.assign(item, { state: "failed", error: "The video proposal has no concepts" });
          continue;
        }
        await approveVideoProject(run.workspace_id, p.id, { concept: concept.key, script: concept.script ?? [], voice: voice?.narrator_voice ?? "af_heart", captions: true });
        continue;
      }
      if (p.status === "failed") {
        if (item.retried) Object.assign(item, { state: "failed", error: p.error ?? "The video failed" });
        else {
          item.retried = true;
          await retryVideoProject(run.workspace_id, p.id).catch((e) => Object.assign(item, { state: "failed", error: (e as Error).message }));
        }
        continue;
      }
      if (p.status !== "done" || !p.media_id) continue; // proposing / building
      mediaIds = [p.media_id];
      const t = p.proposal?.treatment;
      const caption = t?.concepts?.find((c: any) => c.key === p.approval?.concept)?.post_caption;
      if (caption) content = draftText({ content: caption, hashtags: d.hashtags });
    }

    const fallback = spreadTime(start, end, drafted.indexOf(item), drafted.length);
    const at = clampTime(d.suggested_at, new Date(Date.now() + MIN_LEAD_MS), end, fallback);
    try {
      const post = await upsertPost(db, run.workspace_id, null, {
        content,
        title: d.title,
        mediaIds,
        topic: d.idea?.topic ?? null,
        scheduledAt: at.toISOString(),
        draftId: d.id,
        targets: targets.map((a) => ({ accountId: a.id, platform: a.platform as PlatformKey })),
      });
      Object.assign(item, { state: "done", postId: post.id, at: at.toISOString() });
    } catch (e) {
      Object.assign(item, { state: "failed", error: (e as Error).message });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------------------------- helpers

async function recordFailure(scheduleId: string, message: string) {
  const db = createAdminClient();
  const { data: s } = await db.from("autopilot_schedules").select("consecutive_failures").eq("id", scheduleId).single();
  const failures = (s?.consecutive_failures ?? 0) + 1;
  await db
    .from("autopilot_schedules")
    .update({
      consecutive_failures: failures,
      last_error: failures >= MAX_FAILURES ? `Paused after ${failures} failed runs in a row. Last: ${message}` : message,
      ...(failures >= MAX_FAILURES ? { enabled: false } : {}),
    })
    .eq("id", scheduleId);
}

export function describeHours(h: number) {
  if (h % 168 === 0) return h === 168 ? "week" : `${h / 168} weeks`;
  if (h % 24 === 0) return h === 24 ? "day" : `${h / 24} days`;
  return h === 1 ? "hour" : `${h} hours`;
}
