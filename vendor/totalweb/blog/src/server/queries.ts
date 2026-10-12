import { createAdminClient } from "@totalweb/supabase/admin";
import { createClient } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import type { PostStatus } from "../core/index.ts";
import type { BlogGenerationJob, BlogPost, BlogPostSummary } from "../types";
import { withBlogProgress } from "./engine";
import { publicWorkspaceId } from "./env";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function rows<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------------------
// Admin (RLS, current workspace)
// ---------------------------------------------------------------------------
export type AdminPostRow = Pick<
  BlogPost,
  "id" | "status" | "slug" | "title" | "focus_keyword" | "ai_generated" | "published_at" | "updated_at" | "meta_description" | "seo_title" | "body_md"
>;

export async function listPosts(status?: PostStatus) {
  const { supabase, ws } = await ctx();
  let q = supabase
    .from("blog_posts")
    .select("id, status, slug, title, focus_keyword, ai_generated, published_at, updated_at, meta_description, seo_title, body_md")
    .eq("workspace_id", ws)
    .order("updated_at", { ascending: false });
  q = status ? q.eq("status", status) : q.neq("status", "archived");
  return rows<AdminPostRow[]>(await q);
}

export async function countByStatus() {
  const { supabase, ws } = await ctx();
  const data = rows<{ status: PostStatus }[]>(await supabase.from("blog_posts").select("status").eq("workspace_id", ws));
  return data.reduce<Partial<Record<PostStatus, number>>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
}

export async function getPost(id: string) {
  const { supabase, ws } = await ctx();
  return rows<BlogPost | null>(await supabase.from("blog_posts").select("*").eq("id", id).eq("workspace_id", ws).maybeSingle());
}

export async function listRevisions(postId: string) {
  const { supabase, ws } = await ctx();
  return rows<{ id: string; source: "ai" | "human"; created_at: string; title: string }[]>(
    await supabase
      .from("blog_post_revisions")
      .select("id, source, created_at, title")
      .eq("workspace_id", ws)
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(20),
  );
}

export async function listJobs(limit = 10) {
  const { supabase, ws } = await ctx();
  const jobs = rows<BlogGenerationJob[]>(
    await supabase.from("blog_generation_jobs").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit),
  );
  return withBlogProgress(jobs);
}

// ---------------------------------------------------------------------------
// Public site (service role, scoped to the site's workspace, live posts only).
// Returns empty results instead of throwing so the public site still renders before Supabase is configured.
// ---------------------------------------------------------------------------
const SUMMARY = "slug, title, excerpt, published_at, updated_at, tags, reading_minutes, cover_url, cover_alt, noindex";

function live(columns: string) {
  const ws = publicWorkspaceId();
  if (!ws) return null;
  const now = new Date().toISOString();
  return createAdminClient()
    .from("blog_posts")
    .select(columns)
    .eq("workspace_id", ws)
    .or(`status.eq.published,and(status.eq.scheduled,published_at.lte."${now}")`);
}

export async function getPublishedPosts({ limit = 50, tag }: { limit?: number; tag?: string } = {}): Promise<BlogPostSummary[]> {
  try {
    let q = live(SUMMARY);
    if (!q) return [];
    if (tag) q = q.contains("tags", [tag]);
    const { data } = await q.order("published_at", { ascending: false }).limit(limit);
    return (data ?? []) as unknown as BlogPostSummary[];
  } catch {
    return [];
  }
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  try {
    const q = live("*");
    if (!q) return null;
    const { data } = await q.eq("slug", slug).maybeSingle();
    return (data as unknown as BlogPost) ?? null;
  } catch {
    return null;
  }
}

/** Other live posts sharing a tag, for "Related posts" (internal linking). */
export async function getRelatedPosts(post: Pick<BlogPost, "slug" | "tags">, limit = 3) {
  const all = await getPublishedPosts({ limit: 30 });
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, score: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => p);
}
