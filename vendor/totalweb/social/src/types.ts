import type { PlatformKey } from "./core/types.ts";
import type { GeneratedState } from "./core/generated.ts";
import type { PostType } from "./core/platforms.ts";

export interface Account {
  id: string;
  workspace_id: string;
  platform: PlatformKey;
  external_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  settings: Record<string, any>;
  status: "active" | "expired" | "revoked" | "error";
  last_error: string | null;
  token_expires_at: string | null;
}

export type TargetStatus = "pending" | "publishing" | "processing" | "published" | "failed" | "cancelled";

export interface PostTarget {
  id: string;
  platform: PlatformKey;
  account_id: string;
  status: TargetStatus;
  external_url: string | null;
  error: string | null;
  content_override?: string | null;
  options?: Record<string, unknown>;
  scheduled_at?: string | null;
  /** Set when a retryable failure put the target back in the queue. */
  next_attempt_at?: string | null;
  published_at?: string | null;
}

export interface Post {
  id: string;
  content: string;
  title: string | null;
  link: string | null;
  media_ids: string[];
  tags: string[];
  status: "draft" | "scheduled" | "publishing" | "published" | "partially_published" | "failed";
  scheduled_at: string | null;
  published_at: string | null;
  topic: string | null;
  format: string | null;
  source: "manual" | "ai";
  targets: PostTarget[];
}

export interface MediaAsset {
  id: string;
  storage_path: string;
  kind: "image" | "video";
  mime: string;
  size_bytes: number | null;
  source: string;
  url?: string | null;
}

export interface GenerationJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  request: Record<string, any>;
  insights: Record<string, any> | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  engine_job_id?: string | null;
  /** Live from the engine while the job runs (not stored). */
  stage?: string | null;
  progress?: number | null;
  /** Live OpenAI spend while running (USD); the final breakdown is insights.cost. */
  cost_usd?: number | null;
}

export interface Draft {
  id: string;
  job_id: string;
  platform: PlatformKey;
  content: string;
  title: string | null;
  hashtags: string[];
  suggested_at: string | null;
  rationale: string | null;
  idea: Record<string, any>;
  media_ids: string[];
  status: "pending" | "approved" | "rejected";
  post_id?: string | null;
  created_at?: string;
  /** The video director project making this draft's film (video drafts from a batch). */
  video_project?: { id: string; status: string } | null;
}

/** A generated draft with what happened to it after approval (Generated tab). */
export interface GeneratedPost extends Draft {
  created_at: string;
  post_type: PostType;
  state: GeneratedState;
  post: { id: string; status: Post["status"]; scheduled_at: string | null; published_at: string | null } | null;
  /** What making this post's video cost (USD) and took (s), and what the whole generation job cost. */
  cost: { video_usd: number | null; video_seconds: number | null; job_usd: number | null };
  /** The post's target on this draft's platform, when there is one. */
  target: { status: TargetStatus; external_url: string | null; error: string | null; published_at: string | null } | null;
}

export interface Competitor {
  id: string;
  name: string;
  website: string | null;
  handles: Record<string, string>;
  summary: { top_topics?: string[]; posting_frequency?: string; sample_posts?: { platform: string; text: string; url?: string }[]; why?: string };
  source: "engine" | "manual";
  pinned: boolean;
  updated_at: string;
}

/** A video made by the director (Videos tab): proposal → approval → film. */
export interface VideoProject {
  id: string;
  draft_id: string | null;
  title: string | null;
  status: "proposing" | "proposed" | "building" | "done" | "failed";
  request: Record<string, any>;
  proposal: Record<string, any> | null;
  approval: Record<string, any> | null;
  proposal_job_id: string | null;
  build_job_id: string | null;
  media_id: string | null;
  result: Record<string, any> | null;
  cost: Record<string, any> | null;
  error: string | null;
  created_at: string;
  video_url?: string | null;
  /** Live from the engine while proposing/building. */
  live?: { stage: string | null; progress: number | null; cost_usd: number | null } | null;
}

/** How the brand writes, and the narrator voice its videos use. One per workspace is the default. */
export interface VoiceProfile {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  examples: string[];
  narrator_voice: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
