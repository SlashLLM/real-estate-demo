import type { PlatformKey } from "./types.ts";

export type { PlatformKey };

export interface PlatformConfig {
  key: PlatformKey;
  name: string;
  category: string;
  charLimit: number;
  titleLimit?: number;
  mediaTypes: ("image" | "video")[];
  /** Platform rejects posts without media. */
  requiresMedia: boolean;
  maxImages: number;
  privacyOptions: string[];
  defaultPrivacy: string;
  hasTitle?: boolean;
  hasCategories?: boolean;
  hasDuetStitch?: boolean;
  hasDestinationLink?: boolean;
  hasBoard?: boolean;
  /** Brand colour for chips/badges. */
  color: string;
  description: string;
}

/**
 * Platform registry (limits, media rules, options). Ported from the reference scheduler's
 * social-manager.js and extended with the rules the direct-API adapters enforce.
 */
export const PLATFORMS: Record<PlatformKey, PlatformConfig> = {
  youtube: {
    key: "youtube",
    name: "YouTube",
    category: "Video",
    charLimit: 5000,
    titleLimit: 100,
    mediaTypes: ["video"],
    requiresMedia: true,
    maxImages: 0,
    privacyOptions: ["public", "unlisted", "private"],
    defaultPrivacy: "public",
    hasTitle: true,
    hasCategories: true,
    color: "#ff0033",
    description: "Upload videos and Shorts to your channel with title, tags and privacy.",
  },
  tiktok: {
    key: "tiktok",
    name: "TikTok",
    category: "Short video",
    charLimit: 2200,
    mediaTypes: ["video"],
    requiresMedia: true,
    maxImages: 0,
    privacyOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
    defaultPrivacy: "PUBLIC_TO_EVERYONE",
    hasDuetStitch: true,
    color: "#25f4ee",
    description: "Upload vertical videos with caption, privacy and duet/stitch controls.",
  },
  instagram: {
    key: "instagram",
    name: "Instagram",
    category: "Visual",
    charLimit: 2200,
    mediaTypes: ["image", "video"],
    requiresMedia: true,
    maxImages: 10,
    privacyOptions: ["public"],
    defaultPrivacy: "public",
    color: "#e1306c",
    description: "Publish photos, carousels and Reels to Business or Creator accounts.",
  },
  facebook: {
    key: "facebook",
    name: "Facebook",
    category: "Social network",
    charLimit: 63206,
    mediaTypes: ["image", "video"],
    requiresMedia: false,
    maxImages: 1,
    privacyOptions: ["public"],
    defaultPrivacy: "public",
    hasDestinationLink: true,
    color: "#1877f2",
    description: "Publish posts, photos and videos to Facebook Pages.",
  },
  x: {
    key: "x",
    name: "X (Twitter)",
    category: "Microblogging",
    charLimit: 280,
    mediaTypes: ["image", "video"],
    requiresMedia: false,
    maxImages: 4,
    privacyOptions: ["public"],
    defaultPrivacy: "public",
    color: "#a3a3a3",
    description: "Post text, images and video to X.",
  },
  linkedin: {
    key: "linkedin",
    name: "LinkedIn",
    category: "Professional",
    charLimit: 3000,
    mediaTypes: ["image", "video"],
    requiresMedia: false,
    maxImages: 1,
    privacyOptions: ["PUBLIC", "CONNECTIONS"],
    defaultPrivacy: "PUBLIC",
    color: "#0a66c2",
    description: "Share updates with images or video to your profile or company page.",
  },
  threads: {
    key: "threads",
    name: "Threads",
    category: "Microblogging",
    charLimit: 500,
    mediaTypes: ["image", "video"],
    requiresMedia: false,
    maxImages: 1,
    privacyOptions: ["public"],
    defaultPrivacy: "public",
    color: "#8b5cf6",
    description: "Share text, photos and videos on Threads.",
  },
  pinterest: {
    key: "pinterest",
    name: "Pinterest",
    category: "Inspiration",
    charLimit: 500,
    titleLimit: 100,
    mediaTypes: ["image", "video"],
    requiresMedia: true,
    maxImages: 1,
    privacyOptions: ["public"],
    defaultPrivacy: "public",
    hasTitle: true,
    hasDestinationLink: true,
    hasBoard: true,
    color: "#e60023",
    description: "Create Pins with a title, description and destination link on a board.",
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

/** The three kinds of post the AI studio makes: an image with a text overlay, a short video, or text only. */
export type PostType = "image" | "video" | "text";

export const POST_TYPES: { key: PostType; label: string; description: string }[] = [
  { key: "image", label: "Image with text", description: "One image with the headline set on it" },
  { key: "video", label: "Video", description: "Short vertical video with voiceover and captions" },
  { key: "text", label: "Text only", description: "Copy that stands on its own, no media" },
];

/** Whether a platform accepts a post type (text-only needs a platform that doesn't require media). */
export function supportsPostType(platform: PlatformKey, type: PostType): boolean {
  const cfg = PLATFORMS[platform];
  return type === "text" ? !cfg.requiresMedia : cfg.mediaTypes.includes(type);
}

export interface ValidationIssue {
  platform: PlatformKey;
  message: string;
}

/** Checks a post against a platform's rules before scheduling. */
export function validateForPlatform(
  platform: PlatformKey,
  post: { text: string; title?: string | null; media: { kind: "image" | "video" }[] },
): ValidationIssue[] {
  const cfg = PLATFORMS[platform];
  const issues: ValidationIssue[] = [];
  const push = (message: string) => issues.push({ platform, message });
  const length = [...post.text].length;

  if (length > cfg.charLimit) push(`Text is ${length}/${cfg.charLimit} characters`);
  if (cfg.titleLimit && (post.title?.length ?? 0) > cfg.titleLimit) push(`Title exceeds ${cfg.titleLimit} characters`);
  if (cfg.hasTitle && platform === "youtube" && !post.title?.trim()) push("A title is required");
  if (cfg.requiresMedia && post.media.length === 0) push("Requires an image or video");
  if (!post.text.trim() && post.media.length === 0) push("Post is empty");

  const videos = post.media.filter((m) => m.kind === "video").length;
  const images = post.media.length - videos;
  if (videos && !cfg.mediaTypes.includes("video")) push("Videos are not supported");
  if (images && !cfg.mediaTypes.includes("image")) push("Images are not supported");
  if (videos > 1) push("Only one video per post");
  if (videos && images && platform !== "instagram") push("Cannot mix images and video");
  if (images > cfg.maxImages && cfg.maxImages > 0) push(`At most ${cfg.maxImages} image(s)`);
  return issues;
}
