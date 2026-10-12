import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { draftPostType, generatedState, isConfigured, PLATFORM_KEYS, type PlatformKey } from "../core/index.ts";
import { env } from "./env";
import { resolveBrand } from "./brand";
import { withEngineProgress } from "./engine-client";
import type { Account, Competitor, Draft, GeneratedPost, GenerationJob, MediaAsset, Post } from "../types";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id, workspace };
}

function rows<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Platforms whose developer-app credentials are present in env. */
export function configuredPlatforms(): PlatformKey[] {
  return PLATFORM_KEYS.filter((p) => isConfigured(p, env));
}

export async function listAccounts() {
  const { supabase, ws } = await ctx();
  return rows<Account[]>(await supabase.from("social_accounts_public").select("*").eq("workspace_id", ws).order("platform"));
}

export async function listPosts({ from, to }: { from?: string; to?: string } = {}) {
  const { supabase, ws } = await ctx();
  let q = supabase
    .from("social_posts")
    .select("*, targets:social_post_targets(id, platform, account_id, status, external_url, error, content_override, options, scheduled_at, next_attempt_at, published_at)")
    .eq("workspace_id", ws)
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  if (from) q = q.gte("scheduled_at", from);
  if (to) q = q.lte("scheduled_at", to);
  return rows<Post[]>(await q);
}

export async function listRecentPosts(limit = 50) {
  const { supabase, ws } = await ctx();
  return rows<Post[]>(
    await supabase
      .from("social_posts")
      .select("*, targets:social_post_targets(id, platform, account_id, status, external_url, error)")
      .eq("workspace_id", ws)
      .neq("status", "draft")
      .order("scheduled_at", { ascending: false })
      .limit(limit),
  );
}

export async function listMedia(ids?: string[]) {
  const { supabase, ws } = await ctx();
  let q = supabase.from("social_media_assets").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(200);
  if (ids) q = q.in("id", ids);
  const assets = rows<MediaAsset[]>(await q);
  if (!assets.length) return assets;
  const { data: signed } = await supabase.storage.from("media").createSignedUrls(assets.map((a) => a.storage_path), 3600);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return assets.map((a) => ({ ...a, url: urlByPath.get(a.storage_path) ?? null }));
}

export async function getAnalytics(days = 30) {
  const { supabase, ws } = await ctx();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const [perf, followers] = await Promise.all([
    supabase.from("social_post_performance").select("*").eq("workspace_id", ws).gte("published_at", since),
    supabase
      .from("social_account_metrics")
      .select("account_id, followers, captured_at")
      .eq("workspace_id", ws)
      .gte("captured_at", since)
      .order("captured_at"),
  ]);
  const posts = rows<any[]>(perf);
  const engagement = (p: any) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
  const reachOf = (p: any) => p.reach ?? p.impressions ?? p.views ?? 0;

  const byPlatform: Record<string, { posts: number; reach: number; engagement: number }> = {};
  const byHour: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const countByHour: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of posts) {
    const b = (byPlatform[p.platform] ??= { posts: 0, reach: 0, engagement: 0 });
    b.posts++;
    b.reach += reachOf(p);
    b.engagement += engagement(p);
    const d = new Date(p.published_at);
    byHour[d.getDay()][d.getHours()] += engagement(p);
    countByHour[d.getDay()][d.getHours()]++;
  }
  const avgByHour = byHour.map((row, d) => row.map((v, h) => (countByHour[d][h] ? v / countByHour[d][h] : 0)));

  const followerSeries = new Map<string, { first: number; last: number }>();
  for (const f of rows<any[]>(followers)) {
    const s = followerSeries.get(f.account_id);
    if (!s) followerSeries.set(f.account_id, { first: f.followers, last: f.followers });
    else s.last = f.followers;
  }

  return {
    totals: {
      posts: posts.length,
      reach: posts.reduce((s, p) => s + reachOf(p), 0),
      engagement: posts.reduce((s, p) => s + engagement(p), 0),
      followerGrowth: [...followerSeries.values()].reduce((s, f) => s + ((f.last ?? 0) - (f.first ?? 0)), 0),
    },
    byPlatform,
    avgEngagementByDayHour: avgByHour,
    topPosts: [...posts].sort((a, b) => engagement(b) - engagement(a)).slice(0, 10),
  };
}

export async function getGenerationState() {
  const { supabase, ws, workspace } = await ctx();
  const [jobs, drafts, ws_] = await Promise.all([
    supabase.from("social_generation_jobs").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(10),
    supabase
      .from("social_generated_drafts")
      .select("*")
      .eq("workspace_id", ws)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("workspaces").select("settings").eq("id", ws).single(),
  ]);
  return {
    workspaceName: workspace.name,
    brand: (() => {
      const b = resolveBrand(workspace.name, (ws_.data?.settings as any)?.brand);
      return b.niche ? b : (ws_.data?.settings as any)?.brand ?? null;
    })(),
    jobs: await withEngineProgress(rows<GenerationJob[]>(jobs)),
    drafts: await withVideoProjects(supabase, rows<Draft[]>(drafts)),
  };
}

/** Video drafts carry their director project, so the UI can show where the film is instead of an empty post. */
async function withVideoProjects(supabase: Awaited<ReturnType<typeof ctx>>["supabase"], drafts: Draft[]): Promise<Draft[]> {
  if (!drafts.length) return drafts;
  const { data } = await supabase
    .from("social_video_projects")
    .select("id, status, draft_id, created_at")
    .in("draft_id", drafts.map((d) => d.id))
    .order("created_at", { ascending: true });
  const byDraft = new Map((data ?? []).map((v: any) => [v.draft_id as string, { id: v.id as string, status: v.status as string }]));
  return drafts.map((d) => ({ ...d, video_project: byDraft.get(d.id) ?? null }));
}

export async function listCompetitors() {
  const { supabase, ws } = await ctx();
  return rows<Competitor[]>(
    await supabase.from("social_competitors").select("*").eq("workspace_id", ws).order("pinned", { ascending: false }).order("name"),
  );
}

/** Every AI-generated draft (newest first) with its approval, schedule and per-platform publish state. */
export async function listGeneratedPosts(limit = 300): Promise<{ posts: GeneratedPost[]; media: MediaAsset[] }> {
  const { supabase, ws } = await ctx();
  const drafts = rows<(Draft & { created_at: string })[]>(
    await supabase
      .from("social_generated_drafts")
      .select("*")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  const postIds = [...new Set(drafts.map((d) => d.post_id).filter(Boolean))] as string[];
  const posts = postIds.length
    ? rows<any[]>(
        await supabase
          .from("social_posts")
          .select("id, status, scheduled_at, published_at, targets:social_post_targets(platform, status, external_url, error, published_at)")
          .in("id", postIds),
      )
    : [];
  const postById = new Map(posts.map((p) => [p.id, p]));
  const jobIds = [...new Set(drafts.map((d) => d.job_id))];
  const jobs = jobIds.length
    ? rows<{ id: string; insights: Record<string, any> | null }[]>(
        await supabase.from("social_generation_jobs").select("id, insights").in("id", jobIds),
      )
    : [];
  const costByJob = new Map(jobs.map((j) => [j.id, j.insights?.cost ?? null]));
  const draftIds = drafts.map((d) => d.id);
  const { data: vp } = draftIds.length
    ? await supabase.from("social_video_projects").select("id, status, draft_id").in("draft_id", draftIds)
    : { data: [] as { id: string; status: string; draft_id: string }[] };
  const projectByDraft = new Map((vp ?? []).map((v: any) => [v.draft_id, { id: v.id, status: v.status }]));
  const mediaIds = [...new Set(drafts.flatMap((d) => d.media_ids ?? []))];
  const media = mediaIds.length ? await listMedia(mediaIds) : [];

  return {
    media,
    posts: drafts.map((d) => {
      const post = d.post_id ? postById.get(d.post_id) ?? null : null;
      const target = post?.targets?.find((t: any) => t.platform === d.platform) ?? null;
      return {
        ...d,
        post_type: draftPostType(d.idea),
        state: generatedState(d.status, post, target),
        post: post && { id: post.id, status: post.status, scheduled_at: post.scheduled_at, published_at: post.published_at },
        video_project: projectByDraft.get(d.id) ?? null,
        cost: (() => {
          const c = costByJob.get(d.job_id);
          const v = d.idea?.idea_id ? c?.videos?.[d.idea.idea_id] : null;
          return { video_usd: v?.usd ?? null, video_seconds: v?.seconds ?? null, job_usd: c?.total_usd ?? null };
        })(),
        target: target && { status: target.status, external_url: target.external_url, error: target.error, published_at: target.published_at },
      };
    }),
  };
}
