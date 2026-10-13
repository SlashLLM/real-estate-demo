// Creating/updating a post with its per-account targets. Shared by the composer (savePost, with the user's RLS
// client) and the autopilot (service role, no user), so both go through the same platform validation.
import { z } from "zod";
import { PLATFORM_KEYS, validateForPlatform, type PlatformKey } from "../core/index.ts";

const platformEnum = z.enum(PLATFORM_KEYS as [PlatformKey, ...PlatformKey[]]);

export const postSchema = z.object({
  id: z.string().uuid().optional(),
  content: z.string().default(""),
  title: z.string().nullish(),
  link: z.string().url().nullish().or(z.literal("")),
  mediaIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  topic: z.string().nullish(),
  format: z.string().nullish(),
  /** ISO timestamp; omitted = save as draft, "now" = due immediately (follow with publishNow to send it right away) */
  scheduledAt: z.string().nullish(),
  draft: z.boolean().default(false),
  draftId: z.string().uuid().nullish(),
  targets: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        platform: platformEnum,
        contentOverride: z.string().nullish(),
        options: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1, "Pick at least one account"),
});
export type SavePostInput = z.input<typeof postSchema>;

// `db` is untyped here (either client), so results are too.
function check(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Inserts or updates a post and (re)creates its unsent targets. `db` is the caller's client (RLS or service role). */
export async function upsertPost(db: any, workspaceId: string, userId: string | null, input: SavePostInput) {
  const p = postSchema.parse(input);

  // Validate against each platform's rules using the media kinds of the attached assets.
  const media = p.mediaIds.length
    ? check(await db.from("social_media_assets").select("id, kind").eq("workspace_id", workspaceId).in("id", p.mediaIds))
    : [];
  const issues = p.targets.flatMap((t) =>
    validateForPlatform(t.platform, { text: t.contentOverride ?? p.content, title: p.title, media: media as { kind: "image" | "video" }[] }),
  );
  if (issues.length && !p.draft) throw new Error(issues.map((i) => `${i.platform}: ${i.message}`).join("\n"));

  const scheduledAt = p.draft ? null : p.scheduledAt === "now" || !p.scheduledAt ? new Date().toISOString() : p.scheduledAt;
  const values = {
    workspace_id: workspaceId,
    content: p.content,
    title: p.title ?? null,
    link: p.link || null,
    media_ids: p.mediaIds,
    tags: p.tags,
    topic: p.topic ?? null,
    format: p.format ?? (media.some((m: any) => m.kind === "video") ? "video" : media.length > 1 ? "carousel" : media.length ? "image" : "text"),
    status: p.draft ? "draft" : "scheduled",
    scheduled_at: scheduledAt,
    source: p.draftId ? "ai" : "manual",
    draft_id: p.draftId ?? null,
  };

  const post = p.id
    ? check(await db.from("social_posts").update(values).eq("id", p.id).eq("workspace_id", workspaceId).select().single())
    : check(await db.from("social_posts").insert({ ...values, created_by: userId }).select().single());

  // Replace targets that haven't gone out yet; never touch published/in-flight ones.
  let locked = new Set<string>();
  if (p.id) {
    check(await db.from("social_post_targets").delete().eq("post_id", p.id).in("status", ["pending", "failed", "cancelled"]));
    const remaining = check(await db.from("social_post_targets").select("account_id").eq("post_id", p.id));
    locked = new Set((remaining as { account_id: string }[]).map((r) => r.account_id));
  }
  const fresh = p.targets.filter((t) => !locked.has(t.accountId));
  if (fresh.length) check(
    await db.from("social_post_targets").insert(
      fresh.map((t) => ({
        workspace_id: workspaceId,
        post_id: post.id,
        account_id: t.accountId,
        platform: t.platform,
        content_override: t.contentOverride ?? null,
        options: t.options,
        status: p.draft ? "cancelled" : "pending",
        scheduled_at: scheduledAt,
        attempts: 0,
        next_attempt_at: null,
        error: null,
      })),
    ),
  );

  if (p.draftId) {
    await db.from("social_generated_drafts").update({ status: "approved", post_id: post.id }).eq("id", p.draftId);
  }
  return post;
}
