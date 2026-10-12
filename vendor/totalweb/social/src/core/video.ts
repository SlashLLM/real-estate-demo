// Video director formats and helpers shared by the server (server/video.ts) and the Videos tab UI.

import type { PlatformKey } from "./platforms.ts";
export type VideoFormat = "demo" | "social" | "feed";

export const VIDEO_FORMATS: Record<VideoFormat, { label: string; aspect: string; lengths: number[]; hint: string; captions: boolean }> = {
  demo: { label: "Product demo", aspect: "16:9", lengths: [60, 90, 120], hint: "Narrated walkthrough of the real product on laptops: YouTube, LinkedIn, your site", captions: false },
  social: { label: "Social ad", aspect: "9:16", lengths: [15, 30, 45], hint: "Vertical, hook in the first second, captions on: Reels, TikTok, Shorts", captions: true },
  feed: { label: "Feed ad", aspect: "4:5", lengths: [15, 30, 45], hint: "Portrait for the Instagram, Facebook and LinkedIn feeds", captions: true },
};

export const VOICE_LABELS: Record<string, string> = {
  af_heart: "Heart (US, warm)",
  am_michael: "Michael (US)",
  bf_emma: "Emma (UK)",
  bm_george: "George (UK)",
};

/** Spoken length the engine will plan: a 1 s lead, ~2.4 words/s, 0.45 s breaths, a 2.2 s end card. */
export type VoiceMode = "voiceover" | "text";

/** How the film talks: narrated (headlines + captions) or on-screen text over music. */
export const VOICE_MODES: Record<VoiceMode, { label: string; hint: string }> = {
  voiceover: { label: "Voiceover", hint: "Narrated, with big headlines and word-by-word captions" },
  text: { label: "On-screen text + music", hint: "No voice: the headlines tell the story, made for sound-off scrolling" },
};

/** The film's length the way the engine plans it: spoken (2.4 words/s + breaths) or read (0.32 s/word + 0.8 s a line). */
export function estimateSeconds(lines: string[], mode: VoiceMode = "voiceover"): number {
  const kept = lines.map((l) => l.trim()).filter(Boolean);
  if (mode === "text") return Math.round((0.2 + kept.reduce((s, l) => s + Math.max(1.6, 0.32 * l.split(/\s+/).length + 0.8), 0) + 2.2) * 10) / 10;
  const words = kept.reduce((n, l) => n + l.split(/\s+/).length, 0);
  return Math.round((1 + words / 2.4 + 0.45 * Math.max(0, kept.length - 1) + 2.2) * 10) / 10;
}

/** The usual video shape per platform, when the request names no ratio. */
export function formatForPlatform(p: PlatformKey): { format: VideoFormat; aspect: string } {
  return ["tiktok", "instagram", "youtube", "threads"].includes(p) ? { format: "social", aspect: "9:16" } : { format: "feed", aspect: "4:5" };
}

/** The ratio picked in the AI studio form decides the format; the platform's usual shape is only the fallback. */
export function formatForSpec(spec: { aspect?: string } | null | undefined, platform: PlatformKey): { format: VideoFormat; aspect: string } {
  switch (spec?.aspect) {
    case "16:9":
      return { format: "demo", aspect: "16:9" };
    case "9:16":
      return { format: "social", aspect: "9:16" };
    case "4:5":
    case "1:1":
      return { format: "feed", aspect: spec.aspect };
    default:
      return formatForPlatform(platform);
  }
}
