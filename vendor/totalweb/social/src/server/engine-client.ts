// Bridge to the Content Generation Engine (ConGenEng, separate FastAPI service).
// Requests and callbacks are signed: X-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@totalweb/supabase/admin";
import { hmacHex, safeEqual, supportsPostType, type PlatformKey, type PostType } from "../core/index.ts";
import { API_BASE, siteUrl } from "./env";
import { storeMedia } from "./media";
import { resolveBrand } from "./brand";

const MEDIA_URL_TTL_S = 24 * 60 * 60;
const MAX_CLOCK_SKEW_S = 300;

export interface BrandProfile {
  name: string;
  niche: string;
  description?: string;
  voice?: string;
  website?: string;
  audience?: string;
  locale?: string;
  known_competitors?: string[];
  brand_colors?: string[];
  logo_media_id?: string;
}

export interface PostPlanItem {
  type: PostType;
  /** How many distinct posts of this type; each one goes to every platform listed. */
  count: number;
  platforms: PlatformKey[];
}

export interface GenerationOptions {
  postPlan: PostPlanItem[];
  goals?: string;
  /** Applies to the video posts. */
  videoSpec?: { aspect: "9:16" | "1:1" | "4:5" | "16:9"; durationS: number };
  /** media assets the user attached to this request (used as footage/brand assets) */
  mediaIds?: string[];
  historyDays?: number;
}

export function engineConfig() {
  const url = process.env.CONGEN_URL;
  const secret = process.env.CONGEN_SHARED_SECRET;
  if (!url || !secret) throw new Error("CONGEN_URL and CONGEN_SHARED_SECRET must be set");
  return { url: url.replace(/\/$/, ""), secret };
}

export async function signedHeaders(secret: string, body: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return {
    "X-Timestamp": ts,
    "X-Signature": await hmacHex(secret, `${ts}.${body}`),
  };
}

export async function verifySignature(secret: string, ts: string | null, sig: string | null, body: string) {
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_CLOCK_SKEW_S) return false;
  return safeEqual(await hmacHex(secret, `${ts}.${body}`), sig);
}

/** Builds the history payload the engine analyses: published posts with their latest metrics. */
export async function buildHistory(workspaceId: string, days: number) {
  const db = createAdminClient();
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data: perf = [] } = await db
    .from("social_post_performance")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(1000);

  const mediaIds = [...new Set((perf ?? []).flatMap((p: any) => p.media_ids ?? []))];
  const { data: assets = [] } = mediaIds.length
    ? await db.from("social_media_assets").select("id, kind").in("id", mediaIds)
    : { data: [] };
  const kindById = new Map((assets ?? []).map((a: any) => [a.id, a.kind]));

  const { data: accountMetrics = [] } = await db
    .from("social_account_metrics")
    .select("account_id, followers, captured_at, social_accounts!inner(platform, name)")
    .eq("workspace_id", workspaceId)
    .gte("captured_at", since)
    .order("captured_at");

  const accountStats = new Map<string, any>();
  for (const m of (accountMetrics ?? []) as any[]) {
    const s = accountStats.get(m.account_id) ?? {
      platform: m.social_accounts.platform,
      account: m.social_accounts.name,
      followers_start: m.followers,
    };
    s.followers = m.followers;
    accountStats.set(m.account_id, s);
  }

  return {
    history: (perf ?? []).map((p: any) => ({
      id: p.target_id,
      post_id: p.post_id,
      platform: p.platform,
      text: p.content,
      title: p.title,
      topic: p.topic,
      format: p.format ?? inferFormat((p.media_ids ?? []).map((id: string) => kindById.get(id))),
      tags: p.tags ?? [],
      source: p.source,
      url: p.external_url,
      published_at: p.published_at,
      metrics: {
        impressions: p.impressions,
        reach: p.reach,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        saves: p.saves,
        clicks: p.clicks,
        watch_time_s: p.watch_time_s,
      },
    })),
    account_stats: [...accountStats.values()],
  };
}

function inferFormat(kinds: (string | undefined)[]) {
  if (kinds.includes("video")) return "video";
  if (kinds.length > 1) return "carousel";
  if (kinds.length === 1) return "image";
  return "text";
}

/** Starts a generation job on the engine. Returns our social_generation_jobs row id. */
export async function requestGeneration(workspaceId: string, userId: string | null, opts: GenerationOptions) {
  const { url, secret } = engineConfig();
  const db = createAdminClient();

  const { data: ws } = await db.from("workspaces").select("name, settings").eq("id", workspaceId).single();
  const brand = resolveBrand(ws?.name, ws?.settings?.brand);
  if (!brand.niche) throw new Error("Set the brand profile (at least the niche) before generating content");

  const { data: competitors = [] } = await db
    .from("social_competitors")
    .select("name, website, handles")
    .eq("workspace_id", workspaceId);

  const media = [];
  for (const id of [...(opts.mediaIds ?? []), ...(brand.logo_media_id ? [brand.logo_media_id] : [])]) {
    const { data: a } = await db.from("social_media_assets").select("*").eq("id", id).eq("workspace_id", workspaceId).single();
    if (!a) continue;
    const { data: signed } = await db.storage.from("media").createSignedUrl(a.storage_path, MEDIA_URL_TTL_S);
    if (signed)
      media.push({
        id: a.id,
        url: signed.signedUrl,
        mime: a.mime,
        kind: a.kind,
        role: id === brand.logo_media_id ? "logo" : "footage",
      });
  }

  // Only platforms that accept the type; rows with nothing to make are dropped.
  const postPlan = opts.postPlan
    .map((r) => ({
      ...r,
      platforms: [...new Set(r.platforms)].filter((p) => supportsPostType(p, r.type)),
    }))
    .filter((r) => r.count > 0 && r.platforms.length > 0);
  if (!postPlan.length) throw new Error("Choose at least one post type with a count and a platform that supports it");
  const platforms = [...new Set(postPlan.flatMap((r) => r.platforms))];
  const total = postPlan.reduce((n, r) => n + r.count, 0);

  const { data: job, error } = await db
    .from("social_generation_jobs")
    .insert({ workspace_id: workspaceId, request: opts, requested_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const payload = {
    workspace_id: workspaceId,
    job_ref: job.id,
    brand,
    platforms,
    count: total,
    post_plan: postPlan,
    goals: opts.goals ?? null,
    video_spec: opts.videoSpec ? { aspect: opts.videoSpec.aspect, duration_s: opts.videoSpec.durationS } : null,
    known_competitors: competitors,
    media,
    ...(await buildHistory(workspaceId, opts.historyDays ?? 90)),
    callback_url: `${siteUrl()}${API_BASE}/engine/callback`,
  };

  const body = JSON.stringify(payload);
  const res = await fetch(`${url}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await signedHeaders(secret, body)),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    await db
      .from("social_generation_jobs")
      .update({ status: "failed", error: text.slice(0, 1000) })
      .eq("id", job.id);
    throw new Error(`Engine rejected the request (${res.status}): ${text.slice(0, 200)}`);
  }
  const { job_id } = await res.json();
  await db.from("social_generation_jobs").update({ engine_job_id: job_id, status: "running" }).eq("id", job.id);
  return job.id as string;
}

/** Asks the engine to (re)discover competitors synchronously and stores them. */
export async function discoverCompetitors(workspaceId: string) {
  const { url, secret } = engineConfig();
  const db = createAdminClient();
  const { data: ws } = await db.from("workspaces").select("name, settings").eq("id", workspaceId).single();
  const brand = resolveBrand(ws?.name, ws?.settings?.brand);
  const body = JSON.stringify({ workspace_id: workspaceId, brand, limit: 8 });
  const res = await fetch(`${url}/v1/competitors/discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await signedHeaders(secret, body)),
    },
    body,
  });
  if (!res.ok) throw new Error(`Engine error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { competitors } = await res.json();
  await upsertCompetitors(workspaceId, competitors);
  return competitors;
}

async function upsertCompetitors(workspaceId: string, competitors: any[] = []) {
  if (!competitors.length) return;
  const db = createAdminClient();
  await db.from("social_competitors").upsert(
    competitors.map((c) => ({
      workspace_id: workspaceId,
      name: c.name,
      website: c.website ?? null,
      handles: c.handles ?? {},
      summary: {
        top_topics: c.top_topics,
        posting_frequency: c.posting_frequency,
        sample_posts: c.sample_posts,
        why: c.why,
      },
      source: "engine",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "workspace_id,name" },
  );
}

/** Downloads a media file produced by the engine and stores it in the workspace bucket. */
export async function storeEngineMedia(workspaceId: string, m: { url: string; mime: string; kind: "image" | "video" }) {
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`Could not fetch engine media ${m.url}: ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `generated.${m.mime.split("/")[1] ?? "bin"}`, {
    type: m.mime,
  });
  const asset = await storeMedia(workspaceId, file, m.kind, "ai_generated");
  return asset.id as string;
}

/** POST {API_BASE}/engine/callback: the engine delivers job results here. */
export async function handleEngineCallback(req: NextRequest) {
  const { secret } = engineConfig();
  const body = await req.text();
  if (!(await verifySignature(secret, req.headers.get("x-timestamp"), req.headers.get("x-signature"), body))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const out = await applyEngineResult(JSON.parse(body));
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, ...out });
}

export interface EngineJobStatus {
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string | null;
  progress: number;
  error: string | null;
  result: any | null;
  /** OpenAI spend so far, USD. */
  cost_usd?: number;
}

/** GET /v1/jobs/:id on the engine (signed). */
export async function fetchEngineJob(engineJobId: string): Promise<EngineJobStatus> {
  const { url, secret } = engineConfig();
  const res = await fetch(`${url}/v1/jobs/${encodeURIComponent(engineJobId)}`, {
    headers: await signedHeaders(secret, ""),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Engine status ${res.status}`);
  return res.json();
}

/**
 * Adds live stage/progress from the engine to unfinished jobs. If the engine already finished but its callback
 * never arrived (site was down, unreachable from the engine), the result is applied here instead.
 */
export async function withEngineProgress<J extends { id: string; status: string; engine_job_id?: string | null }>(jobs: J[]) {
  return Promise.all(
    jobs.map(async (job) => {
      if ((job.status !== "queued" && job.status !== "running") || !job.engine_job_id) return job;
      try {
        const live = await fetchEngineJob(job.engine_job_id);
        if ((live.status === "succeeded" || live.status === "failed") && live.result) {
          await applyEngineResult(live.result);
          return {
            ...job,
            status: live.status,
            stage: "done",
            progress: 1,
            error: live.error,
          };
        }
        return {
          ...job,
          status: live.status === "queued" ? "queued" : "running",
          stage: live.stage,
          progress: live.progress,
          cost_usd: live.cost_usd ?? null,
        };
      } catch {
        return { ...job, stage: "Waiting for the engine…", progress: null };
      }
    }),
  );
}

/** Stores a finished engine job: drafts (importing generated media), competitors, insights. Idempotent. */
export async function applyEngineResult(
  result: any,
): Promise<{ status: number; error: string } | { duplicate?: boolean; drafts?: number }> {
  if (result.kind === "video_proposal" || result.kind === "video_build") {
    const { applyVideoResult } = await import("./video");
    return applyVideoResult(result);
  }
  const db = createAdminClient();
  const { data: job } = await db.from("social_generation_jobs").select("*").eq("id", result.job_ref).single();
  if (!job) return { status: 404, error: "Unknown job" };
  if (job.status === "succeeded" || job.status === "failed") return { duplicate: true };

  if (result.status !== "succeeded") {
    await db
      .from("social_generation_jobs")
      .update({
        status: "failed",
        error: result.error ?? "Engine failed",
        insights: result.insights ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {};
  }

  await upsertCompetitors(job.workspace_id, result.competitors);

  // Claim the job first so a callback and a status sync arriving together can't both import media and insert drafts.
  const { data: claimed } = await db
    .from("social_generation_jobs")
    .update({
      status: "succeeded",
      insights: result.insights ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .in("status", ["queued", "running"])
    .select("id");
  if (!claimed?.length) return { duplicate: true };
  const release = () => db.from("social_generation_jobs").update({ status: "running", completed_at: null }).eq("id", job.id);

  const drafts = [];
  try {
    for (const d of result.drafts ?? []) {
      const mediaIds: string[] = [];
      for (const m of d.media ?? []) {
        // Media the user sent comes back by id; generated media must be imported.
        if (m.source_media_id) mediaIds.push(m.source_media_id);
        else mediaIds.push(await storeEngineMedia(job.workspace_id, m));
      }
      drafts.push({
        workspace_id: job.workspace_id,
        job_id: job.id,
        platform: d.platform,
        content: d.content,
        title: d.title ?? null,
        hashtags: d.hashtags ?? [],
        suggested_at: d.suggested_time ?? null,
        rationale: d.rationale ?? null,
        idea: d.idea ?? {},
        media_ids: mediaIds,
      });
    }
  } catch (e) {
    await release();
    return {
      status: 502,
      error: `Could not import generated media: ${(e as Error).message}`,
    };
  }
  let inserted: { id: string; platform: PlatformKey; idea: Record<string, any> }[] = [];
  if (drafts.length) {
    const { data, error } = await db.from("social_generated_drafts").insert(drafts).select("id, platform, idea");
    if (error) {
      await release();
      return { status: 500, error: error.message };
    }
    inserted = data ?? [];
  }
  // Video drafts go through the director: open a proposal for each (the client approves the script in the Videos tab).
  const videoDrafts = inserted.filter((d) => d.idea?.video_status === "needs_proposal");
  if (videoDrafts.length) {
    const { startProjectsForDrafts } = await import("./video");
    await startProjectsForDrafts(job.workspace_id, videoDrafts as any, (job.request as any)?.videoSpec);
  }
  return { drafts: drafts.length };
}
