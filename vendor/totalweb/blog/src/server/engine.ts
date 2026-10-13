// Blog articles are written by ConGenEng (POST /v1/blog/generate), using the same signed request/callback
// bridge as the social module. The engine only ever produces drafts; a person reviews and publishes them, or, for
// articles an autopilot schedule ordered, autoPublishPost does.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@totalweb/supabase/admin";
import { engineConfig, fetchEngineJob, resolveBrand, signedHeaders, siteUrl, verifySignature, voiceFor } from "@totalweb/social/server";
import { readingMinutes, seoChecklist, slugify } from "../core/index.ts";
import { autoFixSeo } from "../autopilot/plan";
import type { BlogGenerationJob } from "../types";
import { API_BASE } from "./env";

export interface ArticleRequest {
  /** Omitted: the engine recommends the next article (autopilot). */
  topic?: string;
  focusKeyword?: string;
  audience?: string;
  tone?: string;
  lengthWords?: number;
  notes?: string;
  /** Writing voice; omitted = the workspace's default voice profile (else the brand profile's voice). */
  voiceProfileId?: string | null;
  /** Topics being written right now, so an engine-picked topic doesn't repeat them. */
  avoidTopics?: string[];
  /** Set when an autopilot run made this request. */
  autopilot?: { scheduleId: string; runId: string };
}

/** What the engine returns in `result.article` (kind: "blog_article"). */
export interface EngineArticle {
  title: string;
  slug?: string;
  excerpt?: string;
  body_md: string;
  seo_title?: string;
  meta_description?: string;
  focus_keyword?: string;
  secondary_keywords?: string[];
  faq?: { q: string; a: string }[];
  outline?: unknown;
  sources?: { title?: string; url: string }[];
  tags?: string[];
  category?: string;
  notes?: string;
  /** The topic the engine chose when none was given. */
  topic?: string;
}

/** Starts an article job on the engine. Returns our blog_generation_jobs row id. */
export async function requestArticle(workspaceId: string, userId: string | null, req: ArticleRequest) {
  const { url, secret } = engineConfig();
  const db = createAdminClient();

  const { data: ws } = await db.from("workspaces").select("name, settings").eq("id", workspaceId).single();
  const brand = resolveBrand(ws?.name, ws?.settings?.brand, await voiceFor(workspaceId, req.voiceProfileId));
  if (!brand.niche) throw new Error("Set the brand profile (at least the niche) in Social → AI studio before generating articles");

  // Existing posts: the engine avoids keyword cannibalisation and picks internal links from these.
  const { data: existing } = await db
    .from("blog_posts")
    .select("title, slug, focus_keyword, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived");

  const { data: job, error } = await db
    .from("blog_generation_jobs")
    .insert({ workspace_id: workspaceId, request: req, requested_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const body = JSON.stringify({
    workspace_id: workspaceId,
    job_ref: job.id,
    brand,
    topic: req.topic || null,
    focus_keyword: req.focusKeyword ?? null,
    audience: req.audience ?? brand.audience ?? null,
    tone: req.tone ?? brand.voice ?? null,
    length_words: req.lengthWords ?? 1500,
    notes: req.notes ?? null,
    existing_posts: (existing ?? []).map((p) => ({ ...p, url: `/blog/${p.slug}` })),
    avoid_topics: req.avoidTopics ?? [],
    callback_url: `${siteUrl()}${API_BASE}/engine/callback`,
  });
  const res = await fetch(`${url}/v1/blog/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await signedHeaders(secret, body)) },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    await db.from("blog_generation_jobs").update({ status: "failed", error: text.slice(0, 1000) }).eq("id", job.id);
    throw new Error(`Engine rejected the request (${res.status}): ${text.slice(0, 200)}`);
  }
  const { job_id } = await res.json();
  await db.from("blog_generation_jobs").update({ engine_job_id: job_id, status: "running" }).eq("id", job.id);
  return job.id as string;
}

/** POST {API_BASE}/engine/callback */
export async function handleBlogCallback(req: NextRequest) {
  const { secret } = engineConfig();
  const body = await req.text();
  if (!(await verifySignature(secret, req.headers.get("x-timestamp"), req.headers.get("x-signature"), body))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const out = await applyBlogResult(JSON.parse(body));
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, ...out });
}

/** Stores a finished article as a draft. Idempotent: the job is claimed before the post is inserted. */
export async function applyBlogResult(result: any): Promise<{ status: number; error: string } | { duplicate?: boolean; postId?: string }> {
  if (result.kind !== "blog_article") return { status: 400, error: `Unexpected result kind ${result.kind}` };
  const db = createAdminClient();
  const { data: job } = await db.from("blog_generation_jobs").select("*").eq("id", result.job_ref).single();
  if (!job) return { status: 404, error: "Unknown job" };
  if (job.status === "succeeded" || job.status === "failed") return { duplicate: true };

  if (result.status !== "succeeded" || !result.article?.body_md) {
    await db
      .from("blog_generation_jobs")
      .update({ status: "failed", error: result.error ?? "Engine returned no article", completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .in("status", ["queued", "running"]);
    return {};
  }

  // Claim first so a callback and a status poll arriving together can't both insert the post.
  const { data: claimed } = await db
    .from("blog_generation_jobs")
    .update({ status: "succeeded", completed_at: new Date().toISOString() })
    .eq("id", job.id)
    .in("status", ["queued", "running"])
    .select("id");
  if (!claimed?.length) return { duplicate: true };

  const a = result.article as EngineArticle;
  // The engine chose the topic (autopilot): record it so lists and later runs can see it.
  if (!job.request?.topic && a.topic) {
    await db.from("blog_generation_jobs").update({ request: { ...job.request, topic: a.topic } }).eq("id", job.id);
  }
  try {
    const slug = await uniqueSlug(job.workspace_id, slugify(a.slug || a.title) || "post");
    const { data: post, error } = await db
      .from("blog_posts")
      .insert({
        workspace_id: job.workspace_id,
        job_id: job.id,
        status: "in_review",
        slug,
        title: a.title,
        excerpt: a.excerpt ?? null,
        body_md: a.body_md,
        seo_title: a.seo_title ?? null,
        meta_description: a.meta_description ?? null,
        focus_keyword: a.focus_keyword ?? job.request?.focusKeyword ?? null,
        secondary_keywords: a.secondary_keywords ?? [],
        faq: a.faq ?? [],
        outline: a.outline ?? null,
        sources: a.sources ?? [],
        ai_notes: a.notes ?? null,
        tags: a.tags ?? [],
        category: a.category ?? null,
        reading_minutes: readingMinutes(a.body_md),
        ai_generated: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db
      .from("blog_post_revisions")
      .insert({ workspace_id: job.workspace_id, post_id: post.id, title: a.title, body_md: a.body_md, source: "ai" });
    return { postId: post.id };
  } catch (err) {
    // Release the claim so the engine's retry (or the next status poll) can deliver it again.
    await db.from("blog_generation_jobs").update({ status: "running", completed_at: null }).eq("id", job.id);
    return { status: 500, error: (err as Error).message };
  }
}

/** Adds live stage/progress to unfinished jobs, and applies results whose callback never arrived. */
export async function withBlogProgress(jobs: BlogGenerationJob[]) {
  return Promise.all(
    jobs.map(async (job) => {
      if ((job.status !== "queued" && job.status !== "running") || !job.engine_job_id) return job;
      try {
        const live = await fetchEngineJob(job.engine_job_id);
        if ((live.status === "succeeded" || live.status === "failed") && live.result) {
          await applyBlogResult(live.result);
          return { ...job, status: live.status, stage: "done", progress: 1, error: live.error };
        }
        return { ...job, status: live.status === "queued" ? "queued" : "running", stage: live.stage, progress: live.progress } as BlogGenerationJob;
      } catch {
        return { ...job, stage: "Waiting for the engine…", progress: null };
      }
    }),
  );
}

export async function uniqueSlug(workspaceId: string, wanted: string, exceptId?: string) {
  const db = createAdminClient();
  const { data } = await db.from("blog_posts").select("id, slug").eq("workspace_id", workspaceId).like("slug", `${wanted}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i++) if (!taken.has(`${wanted}-${i}`)) return `${wanted}-${i}`;
}

/**
 * Publishes (or schedules, when `at` is in the future) an article without human review: the autopilot's path.
 * Derivable SEO gaps are filled first; if the checklist still has errors the post stays in review.
 */
export async function autoPublishPost(postId: string, at: Date): Promise<{ ok: true; slug: string; status: "published" | "scheduled" } | { ok: false; reason: string }> {
  const db = createAdminClient();
  const { data: post } = await db.from("blog_posts").select("*").eq("id", postId).single();
  if (!post) return { ok: false, reason: "Post not found" };
  if (post.status !== "in_review" && post.status !== "draft") return { ok: false, reason: `Post is ${post.status}` };
  const fixed = { ...post, ...autoFixSeo(post) };
  const errors = seoChecklist(fixed).filter((c) => c.level === "error" && !c.ok);
  if (errors.length) return { ok: false, reason: errors.map((c) => c.msg).join("; ") };
  const status = at.getTime() <= Date.now() ? "published" : "scheduled";
  const { error } = await db
    .from("blog_posts")
    .update({
      ...autoFixSeo(post),
      status,
      published_at: (status === "published" ? new Date() : at).toISOString(),
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", postId)
    .in("status", ["in_review", "draft"]);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, slug: post.slug, status };
}
