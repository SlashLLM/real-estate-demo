export const POST_STATUSES = ["draft", "in_review", "scheduled", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * Allowed moves. The engine only creates drafts; a person (server action) moves them to scheduled/published, or the
 * autopilot does (autoPublishPost) for articles its schedule ordered — both behind the same SEO checklist.
 */
const NEXT: Record<PostStatus, readonly PostStatus[]> = {
  draft: ["in_review", "scheduled", "published", "archived"],
  in_review: ["draft", "scheduled", "published", "archived"],
  scheduled: ["draft", "published", "archived"],
  published: ["draft", "archived"], // unpublish -> draft
  archived: ["draft"],
};

export const canTransition = (from: PostStatus, to: PostStatus) => NEXT[from].includes(to);

/** Live on the public site at `now`: published, or scheduled with its time reached. */
export function isLive(p: { status: PostStatus; published_at: string | null }, now = new Date()) {
  if (p.status === "published") return true;
  return p.status === "scheduled" && !!p.published_at && new Date(p.published_at) <= now;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};
