export interface SeoCheck {
  id: string;
  /** error blocks publishing; warn is advice. */
  level: "error" | "warn";
  ok: boolean;
  msg: string;
}

export interface SeoInput {
  title: string;
  slug: string;
  body_md: string;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  cover_url?: string | null;
  cover_alt?: string | null;
}

export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

export const wordCount = (md: string) => md.split(/\s+/).filter(Boolean).length;
export const readingMinutes = (md: string) => Math.max(1, Math.round(wordCount(md) / 225));

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 75)
    .replace(/-+$/, "");
}

/** On-page SEO checklist shown in the editor and enforced on publish. */
export function seoChecklist(p: SeoInput): SeoCheck[] {
  const title = (p.seo_title || p.title).trim();
  const desc = (p.meta_description ?? "").trim();
  const kw = p.focus_keyword?.toLowerCase().trim();
  const body = p.body_md.toLowerCase();
  const intro = body.replace(/^#+ .*$/gm, "").trim().slice(0, 600);
  const h2s = (p.body_md.match(/^## /gm) ?? []).length;
  const words = wordCount(p.body_md);
  const images = [...p.body_md.matchAll(/!\[([^\]]*)\]\(/g)];

  return [
    { id: "title-len", level: "error", ok: title.length >= 20 && title.length <= TITLE_MAX, msg: `SEO title 20–${TITLE_MAX} characters (now ${title.length})` },
    { id: "desc-len", level: "error", ok: desc.length >= DESC_MIN && desc.length <= DESC_MAX, msg: `Meta description ${DESC_MIN}–${DESC_MAX} characters (now ${desc.length})` },
    { id: "slug", level: "error", ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) && p.slug.length <= 75, msg: "Slug is lowercase words joined by hyphens" },
    { id: "no-h1", level: "error", ok: !/^# /m.test(p.body_md), msg: "No H1 in the body (the page title is the H1)" },
    { id: "body", level: "error", ok: words >= 300, msg: `At least 300 words (now ${words})` },
    { id: "img-alt", level: "error", ok: images.every((m) => m[1].trim().length > 0), msg: "Every image has alt text" },
    { id: "kw-set", level: "warn", ok: !!kw, msg: "Focus keyword set" },
    { id: "kw-title", level: "warn", ok: !kw || title.toLowerCase().includes(kw), msg: "Focus keyword in the SEO title" },
    { id: "kw-desc", level: "warn", ok: !kw || desc.toLowerCase().includes(kw), msg: "Focus keyword in the meta description" },
    { id: "kw-intro", level: "warn", ok: !kw || intro.includes(kw), msg: "Focus keyword in the first paragraph" },
    { id: "h2s", level: "warn", ok: h2s >= 2, msg: "At least two H2 sections" },
    { id: "length", level: "warn", ok: words >= 800, msg: "800+ words for competitive topics" },
    { id: "internal-link", level: "warn", ok: /\]\(\/(?!\/)/.test(p.body_md), msg: "At least one internal link (/…)" },
    { id: "cover", level: "warn", ok: !!p.cover_url, msg: "Cover image (used for social previews)" },
    { id: "cover-alt", level: "warn", ok: !p.cover_url || !!p.cover_alt?.trim(), msg: "Cover image has alt text" },
  ];
}

export const blocksPublish = (checks: SeoCheck[]) => checks.some((c) => c.level === "error" && !c.ok);
