"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@totalweb/supabase/admin";
import { createClient, requireUser } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { PLATFORM_KEYS, runPublishTick, type PlatformKey } from "../core/index.ts";
import type { Post } from "../types";
import { discoverCompetitors as engineDiscover, requestGeneration as engineGenerate, type BrandProfile } from "./engine-client";
import { encKey, env, UI_BASE } from "./env";
import { upsertPost, type SavePostInput } from "./posts";
import { listVoiceProfiles } from "./voices";
import {
  approveVideoProject,
  retryVideoProject,
  saveDemoAccounts,
  startVideoProject,
  type DemoAccountInput,
  type VideoRequestInput,
} from "./video";

async function ctx() {
  const [supabase, workspace] = await Promise.all([createClient(), requireWorkspace()]);
  return { supabase, ws: workspace.id };
}

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

const platformEnum = z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]);

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------
export type { SavePostInput } from "./posts";

export async function savePost(input: SavePostInput) {
  const { supabase, ws } = await ctx();
  const user = await requireUser();
  const post = await upsertPost(supabase, ws, user.id, input);
  revalidatePath(UI_BASE, "layout");
  return post;
}

export async function deletePost(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_posts").delete().eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

const POST_WITH_TARGETS =
  "*, targets:social_post_targets(id, platform, account_id, status, external_url, error, content_override, options, scheduled_at, next_attempt_at, published_at)";

/** A post with its per-platform targets, for status views (RLS limits it to the user's workspace). */
export async function getPostStatus(id: string): Promise<Post> {
  const { supabase } = await ctx();
  const post = check(await supabase.from("social_posts").select(POST_WITH_TARGETS).eq("id", id).maybeSingle());
  if (!post) throw new Error("Post not found");
  return post as unknown as Post;
}

/**
 * Publishes a post's pending targets right away instead of waiting for the next scheduler tick, and returns the
 * post with fresh statuses. Runs the same publisher tick as pg_cron / the cron route, so other due posts go out too.
 */
export async function publishNow(id: string): Promise<Post> {
  const { supabase } = await ctx();
  await getPostStatus(id); // workspace access check
  const now = new Date().toISOString();
  check(await supabase.from("social_post_targets").update({ scheduled_at: now, next_attempt_at: null }).eq("post_id", id).eq("status", "pending"));
  check(await supabase.from("social_posts").update({ scheduled_at: now }).eq("id", id).eq("status", "scheduled"));
  await runPublishTick({ db: createAdminClient(), env, encKey: encKey(), log: console.log });
  revalidatePath(UI_BASE, "layout");
  return getPostStatus(id);
}

/** Re-queues failed targets of a post. */
export async function retryPost(id: string) {
  const { supabase } = await ctx();
  check(
    await supabase
      .from("social_post_targets")
      .update({ status: "pending", attempts: 0, next_attempt_at: null, error: null, scheduled_at: new Date().toISOString() })
      .eq("post_id", id)
      .eq("status", "failed"),
  );
  await supabase.from("social_posts").update({ status: "scheduled" }).eq("id", id);
  revalidatePath(UI_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function disconnectAccount(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_accounts").delete().eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

export async function updateAccountSettings(id: string, settings: Record<string, unknown>) {
  // Settings updates go through the admin client because members cannot UPDATE social_accounts
  // directly (the table holds tokens); membership is checked first.
  const { supabase, ws } = await ctx();
  const acc = check(await supabase.from("social_accounts").select("id, settings").eq("id", id).eq("workspace_id", ws).single());
  const { createAdminClient } = await import("@totalweb/supabase/admin");
  check(await createAdminClient().from("social_accounts").update({ settings: { ...(acc.settings ?? {}), ...settings } }).eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Brand profile + AI generation (ConGenEng)
// ---------------------------------------------------------------------------
const brandSchema = z.object({
  name: z.string().min(1),
  niche: z.string().min(2),
  description: z.string().optional(),
  voice: z.string().optional(),
  website: z.string().optional(),
  audience: z.string().optional(),
  locale: z.string().optional(),
  known_competitors: z.array(z.string()).optional(),
  brand_colors: z.array(z.string()).optional(),
  logo_media_id: z.string().uuid().optional(),
});

export async function saveBrandProfile(input: BrandProfile) {
  const { supabase, ws } = await ctx();
  const brand = brandSchema.parse(input);
  const current = check(await supabase.from("workspaces").select("settings").eq("id", ws).single());
  check(await supabase.from("workspaces").update({ settings: { ...(current.settings ?? {}), brand } }).eq("id", ws));
  revalidatePath(UI_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Voice profiles (writing voice + narrator voice; RLS: owners/admins write)
// ---------------------------------------------------------------------------
const voiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(10, "Describe the voice in a sentence or two").max(2000),
  examples: z.array(z.string().trim().max(500)).max(10).default([]),
  narrator_voice: z.string().min(2).max(40).default("af_heart"),
});

export async function listVoices() {
  const { ws } = await ctx();
  return listVoiceProfiles(ws);
}

export async function saveVoiceProfile(input: z.input<typeof voiceSchema>) {
  const { supabase, ws } = await ctx();
  const { id, ...v } = voiceSchema.parse(input);
  const values = { ...v, examples: v.examples.filter(Boolean) };
  const saved = id
    ? check(await supabase.from("voice_profiles").update(values).eq("id", id).eq("workspace_id", ws).select().single())
    : check(await supabase.from("voice_profiles").insert({ ...values, workspace_id: ws }).select().single());
  // The first profile becomes the default.
  const { count } = await supabase.from("voice_profiles").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("is_default", true);
  if (!count) await setDefaultVoice((saved as { id: string }).id);
  revalidatePath(UI_BASE, "layout");
  return saved;
}

export async function setDefaultVoice(id: string) {
  const { supabase, ws } = await ctx();
  // Clear first: the partial unique index allows only one default per workspace.
  check(await supabase.from("voice_profiles").update({ is_default: false }).eq("workspace_id", ws).eq("is_default", true));
  check(await supabase.from("voice_profiles").update({ is_default: true }).eq("workspace_id", ws).eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

export async function deleteVoiceProfile(id: string) {
  const { supabase, ws } = await ctx();
  check(await supabase.from("voice_profiles").delete().eq("workspace_id", ws).eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

const generateSchema = z.object({
  postPlan: z
    .array(z.object({ type: z.enum(["image", "video", "text"]), count: z.number().int().min(0).max(10), platforms: z.array(platformEnum) }))
    .min(1)
    .refine((rows) => rows.some((r) => r.count > 0 && r.platforms.length > 0), "Choose at least one post type with a count and a platform"),
  goals: z.string().optional(),
  videoSpec: z.object({ aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]), durationS: z.number().min(5).max(90) }).optional(),
  mediaIds: z.array(z.string().uuid()).default([]),
  historyDays: z.number().int().min(7).max(365).default(90),
});

export async function requestGeneration(input: z.input<typeof generateSchema>) {
  const { ws } = await ctx();
  const user = await requireUser();
  const jobId = await engineGenerate(ws, user.id, generateSchema.parse(input));
  revalidatePath(UI_BASE, "layout");
  return jobId;
}

export async function rejectDraft(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_generated_drafts").update({ status: "rejected" }).eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

/** Puts a rejected draft back into review. */
export async function restoreDraft(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_generated_drafts").update({ status: "pending" }).eq("id", id).eq("status", "rejected"));
  revalidatePath(UI_BASE, "layout");
}

export async function refreshCompetitors() {
  const { ws } = await ctx();
  const result = await engineDiscover(ws);
  revalidatePath(UI_BASE, "layout");
  return result;
}

export async function saveCompetitor(input: { name: string; website?: string; handles?: Record<string, string> }) {
  const { supabase, ws } = await ctx();
  check(
    await supabase.from("social_competitors").upsert(
      { workspace_id: ws, name: input.name, website: input.website ?? null, handles: input.handles ?? {}, source: "manual", pinned: true },
      { onConflict: "workspace_id,name" },
    ),
  );
  revalidatePath(UI_BASE, "layout");
}

export async function deleteCompetitor(id: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_competitors").delete().eq("id", id));
  revalidatePath(UI_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Video director (Videos tab)
// ---------------------------------------------------------------------------
const videoRequestSchema = z.object({
  title: z.string().max(120).optional(),
  format: z.enum(["demo", "social", "feed"]),
  aspect: z.enum(["16:9", "9:16", "1:1", "4:5"]).optional(),
  length_s: z.number().min(10).max(150),
  goal: z.string().max(2000).optional(),
  focus: z.array(z.string().max(120)).max(12).optional(),
  platforms: z.array(platformEnum).optional(),
  useLogins: z.boolean().optional(),
  voiceMode: z.enum(["voiceover", "text"]).optional(),
  draftId: z.string().uuid().nullish(),
});

export async function requestVideo(input: VideoRequestInput) {
  const { ws } = await ctx();
  const user = await requireUser();
  const id = await startVideoProject(ws, user.id, videoRequestSchema.parse(input) as VideoRequestInput);
  revalidatePath(UI_BASE, "layout");
  return id;
}

const approvalSchema = z.object({
  projectId: z.string().uuid(),
  concept: z.string().min(1),
  script: z.array(z.string().max(400)).min(1).max(60),
  voice: z.string().min(2).max(40),
  captions: z.boolean().default(true),
});

export async function approveVideo(input: z.input<typeof approvalSchema>) {
  const { ws } = await ctx();
  const a = approvalSchema.parse(input);
  await approveVideoProject(ws, a.projectId, { concept: a.concept, script: a.script, voice: a.voice, captions: a.captions });
  revalidatePath(UI_BASE, "layout");
}

export async function retryVideo(projectId: string) {
  const { ws } = await ctx();
  await retryVideoProject(ws, z.string().uuid().parse(projectId));
  revalidatePath(UI_BASE, "layout");
}

export async function deleteVideo(projectId: string) {
  const { supabase } = await ctx();
  check(await supabase.from("social_video_projects").delete().eq("id", z.string().uuid().parse(projectId)));
  revalidatePath(UI_BASE, "layout");
}

const demoAccountSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.string().min(1).max(60),
  login_url: z.string().max(300).default("/login"),
  email: z.string().min(3).max(200),
  password: z.string().max(200).optional(),
  notes: z.string().max(300).optional(),
});

export async function saveDemoLogins(input: DemoAccountInput[]) {
  const { ws } = await ctx();
  await saveDemoAccounts(ws, z.array(demoAccountSchema).max(8).parse(input));
  revalidatePath(UI_BASE, "layout");
}
