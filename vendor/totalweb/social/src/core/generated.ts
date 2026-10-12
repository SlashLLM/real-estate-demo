import type { PostType } from "./platforms.ts";

/** Where an AI-generated post is in its life, for one platform. */
export type GeneratedState = "review" | "draft" | "scheduled" | "publishing" | "published" | "failed" | "rejected";

/** Filter groups on the Generated tab. "Not published" covers everything that isn't scheduled or live yet. */
export type GeneratedFilter = "not_published" | "scheduled" | "published" | "failed" | "rejected";

export const GENERATED_FILTERS: { key: GeneratedFilter; label: string; states: GeneratedState[] }[] = [
  { key: "not_published", label: "Not published", states: ["review", "draft"] },
  { key: "scheduled", label: "Scheduled", states: ["scheduled", "publishing"] },
  { key: "published", label: "Published", states: ["published"] },
  { key: "failed", label: "Failed", states: ["failed"] },
  { key: "rejected", label: "Rejected", states: ["rejected"] },
];

export const GENERATED_STATE_LABEL: Record<GeneratedState, string> = {
  review: "Awaiting review",
  draft: "Saved, not scheduled",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  rejected: "Rejected",
};

type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "partially_published" | "failed";
type TargetStatus = "pending" | "publishing" | "processing" | "published" | "failed" | "cancelled";

/**
 * A draft's state: the draft's own status until it's approved, then the post it became, preferring that post's
 * target on the draft's platform (a post can publish on one platform and fail on another).
 */
export function generatedState(
  draftStatus: "pending" | "approved" | "rejected",
  post: { status: PostStatus } | null,
  target: { status: TargetStatus } | null,
): GeneratedState {
  if (draftStatus === "rejected") return "rejected";
  if (draftStatus === "pending" || !post) return draftStatus === "pending" ? "review" : "draft";
  if (target) {
    if (target.status === "published") return "published";
    if (target.status === "failed") return "failed";
    if (target.status === "publishing" || target.status === "processing") return "publishing";
    if (target.status === "cancelled") return "draft";
  }
  switch (post.status) {
    case "published":
    case "partially_published":
      return target ? "scheduled" : "published";
    case "failed":
      return "failed";
    case "publishing":
      return "publishing";
    case "scheduled":
      return "scheduled";
    default:
      return "draft";
  }
}

/** The post type of a draft's idea; older drafts only carry a free-form `format`. */
export function draftPostType(idea: Record<string, any> | null | undefined): PostType {
  const t = idea?.post_type ?? idea?.format;
  if (t === "video" || t === "short") return "video";
  if (t === "text") return "text";
  return "image";
}
