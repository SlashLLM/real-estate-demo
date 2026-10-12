import type { PostStatus } from "./core/status.ts";

export interface FaqItem {
  q: string;
  a: string;
}

export interface BlogPost {
  id: string;
  workspace_id: string;
  job_id: string | null;
  status: PostStatus;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  seo_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  secondary_keywords: string[];
  canonical_url: string | null;
  noindex: boolean;
  cover_url: string | null;
  cover_alt: string | null;
  faq: FaqItem[];
  outline: unknown;
  sources: { title?: string; url: string }[];
  ai_notes: string | null;
  tags: string[];
  category: string | null;
  author_name: string | null;
  reading_minutes: number | null;
  ai_generated: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns the public site needs for the index, sitemap and RSS. */
export type BlogPostSummary = Pick<
  BlogPost,
  "slug" | "title" | "excerpt" | "published_at" | "updated_at" | "tags" | "reading_minutes" | "cover_url" | "cover_alt" | "noindex"
>;

export interface BlogGenerationJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  engine_job_id: string | null;
  request: { topic: string; focusKeyword?: string };
  error: string | null;
  created_at: string;
  completed_at: string | null;
  stage?: string | null;
  progress?: number | null;
}
