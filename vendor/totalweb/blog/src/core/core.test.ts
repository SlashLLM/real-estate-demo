import { describe, expect, it } from "vitest";
import { blocksPublish, canTransition, faqJsonLd, isLive, jsonLdString, seoChecklist, slugify } from "./index.ts";

const para = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("status", () => {
  it("only allows defined moves", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "published")).toBe(true);
    expect(canTransition("archived", "published")).toBe(false);
    expect(canTransition("published", "in_review")).toBe(false);
  });

  it("treats due scheduled posts as live", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(isLive({ status: "scheduled", published_at: "2026-10-12T09:00:00Z" }, now)).toBe(true);
    expect(isLive({ status: "scheduled", published_at: "2026-10-12T11:00:00Z" }, now)).toBe(false);
    expect(isLive({ status: "draft", published_at: "2026-01-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("seo", () => {
  it("slugifies", () => {
    expect(slugify("  Café Tips: 10 Ways to Brew!  ")).toBe("cafe-tips-10-ways-to-brew");
  });

  it("passes a well-formed post", () => {
    const checks = seoChecklist({
      title: "How to brew better coffee at home",
      slug: "brew-better-coffee",
      seo_title: "How to Brew Better Coffee at Home: 10 Tips",
      meta_description: "Learn how to brew better coffee at home with ten simple, practical tips on beans, grind, water and timing.",
      focus_keyword: "brew better coffee",
      body_md: `To brew better coffee start with fresh beans. ${para(400)}\n\n## Beans\n${para(300)}\n\n## Grind\nSee [our guide](/guides/grind). ${para(200)}`,
      cover_url: "https://example.com/y.jpg",
      cover_alt: "A pour-over",
    });
    expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    expect(blocksPublish(checks)).toBe(false);
  });

  it("blocks publishing on errors", () => {
    const checks = seoChecklist({ title: "Hi", slug: "Bad Slug", body_md: "# Title\n\n![](/a.png)" });
    const failed = checks.filter((c) => c.level === "error" && !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["title-len", "desc-len", "slug", "no-h1", "body", "img-alt"]));
    expect(blocksPublish(checks)).toBe(true);
  });
});

describe("jsonld", () => {
  it("omits an empty FAQ and escapes script breakouts", () => {
    expect(faqJsonLd([])).toBeNull();
    expect(jsonLdString({ a: "</script>" })).not.toContain("</script>");
  });
});
