"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, requireUser } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { blocksPublish, canTransition, readingMinutes, seoChecklist, slugify, type PostStatus } from "../core/index.ts";
import type { BlogPost } from "../types";
import { requestArticle as engineRequest, uniqueSlug } from "./engine";
import { PUBLIC_BASE, UI_BASE } from "./env";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/** Admin lists plus every public surface a post appears on. */
function refresh(slug?: string) {
  revalidatePath(UI_BASE, "layout");
  revalidatePath(PUBLIC_BASE);
  if (slug) revalidatePath(`${PUBLIC_BASE}/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath(`${PUBLIC_BASE}/rss.xml`);
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------
const requestSchema = z.object({
  topic: z.string().trim().min(5, "Describe the topic in a few words"),
  focusKeyword: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  tone: z.string().trim().optional(),
  lengthWords: z.number().int().min(600).max(4000).default(1500),
  notes: z.string().trim().optional(),
});

export async function requestArticle(input: z.input<typeof requestSchema>) {
  const { ws } = await ctx();
  const user = await requireUser();
  const jobId = await engineRequest(ws, user.id, requestSchema.parse(input));
  revalidatePath(UI_BASE, "layout");
  return jobId;
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
/** Blank hand-written post; opens the editor. */
export async function createPost() {
  const { supabase, ws } = await ctx();
  const slug = await uniqueSlug(ws, "untitled");
  const post = check(
    await supabase.from("blog_posts").insert({ workspace_id: ws, slug, title: "Untitled post", ai_generated: false }).select("id").single(),
  );
  revalidatePath(UI_BASE, "layout");
  redirect(`${UI_BASE}/${post.id}`);
}

const optional = z.string().trim().nullish().transform((v) => v || null);
const saveSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required"),
  slug: z.string().trim().min(1).transform(slugify),
  body_md: z.string(),
  excerpt: optional,
  seo_title: optional,
  meta_description: optional,
  focus_keyword: optional,
  secondary_keywords: z.array(z.string().trim()).default([]),
  canonical_url: z.string().trim().url().nullish().or(z.literal("")).transform((v) => v || null),
  noindex: z.boolean().default(false),
  cover_url: z.string().trim().url().nullish().or(z.literal("")).transform((v) => v || null),
  cover_alt: optional,
  tags: z.array(z.string().trim()).default([]),
  category: optional,
  author_name: optional,
  faq: z.array(z.object({ q: z.string().trim().min(1), a: z.string().trim().min(1) })).default([]),
});
export type SavePostInput = z.input<typeof saveSchema>;

export async function savePost(input: SavePostInput) {
  const { supabase, ws } = await ctx();
  const user = await requireUser();
  const p = saveSchema.parse(input);
  const before = check(await supabase.from("blog_posts").select("slug, title, body_md").eq("id", p.id).eq("workspace_id", ws).single());
  const slug = p.slug === before.slug ? p.slug : await uniqueSlug(ws, p.slug, p.id);

  check(
    await supabase
      .from("blog_posts")
      .update({ ...p, slug, reading_minutes: readingMinutes(p.body_md) })
      .eq("id", p.id)
      .eq("workspace_id", ws),
  );
  if (before.title !== p.title || before.body_md !== p.body_md) {
    check(
      await supabase
        .from("blog_post_revisions")
        .insert({ workspace_id: ws, post_id: p.id, title: p.title, body_md: p.body_md, source: "human", edited_by: user.id }),
    );
  }
  refresh(before.slug);
  if (slug !== before.slug) refresh(slug);
  return { slug };
}

// ---------------------------------------------------------------------------
// Review & publishing (the human gate)
// ---------------------------------------------------------------------------
async function transition(id: string, to: PostStatus, extra: Record<string, unknown> = {}) {
  const { supabase, ws } = await ctx();
  const post = check(await supabase.from("blog_posts").select("*").eq("id", id).eq("workspace_id", ws).single()) as BlogPost;
  if (!canTransition(post.status, to)) throw new Error(`A ${post.status.replace("_", " ")} post can't be moved to ${to.replace("_", " ")}`);
  if ((to === "published" || to === "scheduled") && blocksPublish(seoChecklist(post))) {
    throw new Error("Fix the SEO errors in the checklist before publishing");
  }
  check(await supabase.from("blog_posts").update({ status: to, ...extra }).eq("id", id).eq("workspace_id", ws));
  refresh(post.slug);
}

async function reviewed() {
  const user = await requireUser();
  return { reviewed_by: user.id, reviewed_at: new Date().toISOString() };
}

export async function submitForReview(id: string) {
  await transition(id, "in_review");
}

export async function backToDraft(id: string) {
  await transition(id, "draft");
}

export async function publishPost(id: string) {
  await transition(id, "published", { ...(await reviewed()), published_at: new Date().toISOString() });
}

export async function schedulePost(id: string, at: string) {
  const when = new Date(at);
  if (Number.isNaN(when.getTime()) || when <= new Date()) throw new Error("Pick a time in the future");
  await transition(id, "scheduled", { ...(await reviewed()), published_at: when.toISOString() });
}

/** Takes a live post off the site; it keeps its content and goes back to draft. */
export async function unpublishPost(id: string) {
  await transition(id, "draft", { published_at: null });
}

export async function archivePost(id: string) {
  await transition(id, "archived");
}

export async function deletePost(id: string) {
  const { supabase, ws } = await ctx();
  const post = check(await supabase.from("blog_posts").delete().eq("id", id).eq("workspace_id", ws).select("slug").single());
  refresh(post.slug);
}
