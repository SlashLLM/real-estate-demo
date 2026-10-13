import { describe, expect, it } from "vitest";
import { blocksPublish, seoChecklist } from "../core/index.ts";
import {
  autoFixSeo,
  clampTime,
  draftText,
  postPlanFor,
  runOutcome,
  scheduleSchema,
  socialConfigSchema,
  spreadTime,
  targetAccounts,
  type RunItem,
} from "./plan";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const item = (kind: RunItem["kind"], state: RunItem["state"]): RunItem => ({ kind, ref: Math.random().toString(36), state });

describe("timing", () => {
  const start = new Date("2026-10-13T00:00:00Z");
  const end = new Date("2026-10-14T00:00:00Z");

  it("spreads items over the window, the first at the start", () => {
    expect(spreadTime(start, end, 0, 3)).toEqual(start);
    expect(spreadTime(start, end, 1, 3).toISOString()).toBe("2026-10-13T08:00:00.000Z");
    expect(spreadTime(start, end, 2, 3).toISOString()).toBe("2026-10-13T16:00:00.000Z");
  });

  it("keeps the engine's suggested time inside the window", () => {
    const earliest = new Date("2026-10-13T01:00:00Z");
    const fallback = new Date("2026-10-13T12:00:00Z");
    expect(clampTime("2026-10-13T05:00:00Z", earliest, end, fallback).toISOString()).toBe("2026-10-13T05:00:00.000Z");
    expect(clampTime("2026-10-12T05:00:00Z", earliest, end, fallback)).toEqual(earliest);
    expect(clampTime("2026-10-20T05:00:00Z", earliest, end, fallback)).toEqual(end);
    expect(clampTime(null, earliest, end, fallback)).toEqual(fallback);
    expect(clampTime("not a date", earliest, end, start)).toEqual(earliest);
  });
});

describe("social", () => {
  it("only targets chosen, active accounts on the draft's platform", () => {
    const accounts = [
      { id: "a", platform: "linkedin", status: "active" },
      { id: "b", platform: "linkedin", status: "expired" },
      { id: "c", platform: "x", status: "active" },
      { id: "d", platform: "linkedin", status: "active" },
    ];
    expect(targetAccounts(accounts, ["a", "b", "c"], "linkedin").map((a) => a.id)).toEqual(["a"]);
  });

  it("builds the engine's post plan from per-type counts", () => {
    const config = socialConfigSchema.parse({ accountIds: ["00000000-0000-4000-8000-000000000000"], counts: { text: 2, image: 0, video: 1 } });
    const plan = postPlanFor(config, ["x", "tiktok", "x"] as any, (p, t) => (t === "video" ? p === "tiktok" : p === "x"));
    expect(plan).toEqual([
      { type: "text", count: 2, platforms: ["x"] },
      { type: "video", count: 1, platforms: ["tiktok"] },
    ]);
  });

  it("appends hashtags like the composer", () => {
    expect(draftText({ content: "Hello", hashtags: ["coffee", "#beans"] })).toBe("Hello\n\n#coffee #beans");
    expect(draftText({ content: "Hello", hashtags: [] })).toBe("Hello");
  });

  it("rejects empty or too frequent video schedules", () => {
    const base = { kind: "social" as const, enabled: true, intervalHours: 2, config: { accountIds: ["00000000-0000-4000-8000-000000000000"], counts: { text: 0, image: 0, video: 0 } } };
    expect(scheduleSchema.safeParse(base).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, config: { ...base.config, counts: { text: 0, image: 0, video: 1 } } }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, intervalHours: 6, config: { ...base.config, counts: { text: 0, image: 0, video: 1 } } }).success).toBe(true);
  });
});

describe("run outcome", () => {
  it("stays open while anything is pending", () => {
    expect(runOutcome([item("social_job", "done"), item("draft", "pending")])).toBeNull();
  });

  it("waits for every ordered article unless ordering failed", () => {
    expect(runOutcome([item("blog_job", "done")], 2)).toBeNull();
    expect(runOutcome([item("blog_job", "done"), item("blog_job", "failed")], 3)).toBe("partial");
    expect(runOutcome([item("blog_job", "done"), item("blog_job", "done")], 2)).toBe("done");
  });

  it("is failed when nothing was published, partial when some was", () => {
    expect(runOutcome([item("social_job", "failed")])).toBe("failed");
    expect(runOutcome([item("social_job", "done")])).toBe("failed"); // the engine returned no drafts
    expect(runOutcome([item("social_job", "done"), item("draft", "done"), item("draft", "skipped")])).toBe("partial");
    expect(runOutcome([item("blog_job", "needs_attention")], 1)).toBe("failed");
  });
});

describe("autoFixSeo", () => {
  const base = { title: "How to choose a pour-over grinder", slug: "pour-over-grinder", body_md: `A grinder decides the taste. ${words(400)}\n\n## Burrs\n${words(20)}` };

  it("leaves a clean article alone", () => {
    expect(autoFixSeo({ ...base, meta_description: "How to choose a pour-over grinder: burr types, settings and budget, from a small roaster." })).toEqual({});
  });

  it("fills a missing meta description, clips a long title and demotes H1s so the article can publish", () => {
    const post = {
      ...base,
      title: "The complete and absolutely exhaustive guide to choosing your very first pour-over grinder",
      body_md: `# Stray\n${base.body_md}`,
      excerpt: "Everything that matters when buying a grinder for pour-over coffee, from burr types to budget.",
      meta_description: null,
    };
    expect(blocksPublish(seoChecklist(post))).toBe(true);
    const fixed = { ...post, ...autoFixSeo(post) };
    expect(fixed.seo_title!.length).toBeLessThanOrEqual(60);
    expect(fixed.meta_description).toBe(post.excerpt);
    expect(fixed.body_md.startsWith("## Stray")).toBe(true);
    expect(blocksPublish(seoChecklist(fixed))).toBe(false);
  });

  it("falls back to the body when the excerpt is too short", () => {
    const fixed = autoFixSeo({ ...base, excerpt: "Short." });
    expect(fixed.meta_description!.length).toBeGreaterThanOrEqual(70);
    expect(fixed.meta_description!.length).toBeLessThanOrEqual(160);
  });
});
