import type { Metadata, MetadataRoute } from "next";
import type { BlogPost, BlogPostSummary } from "../types";
import { PUBLIC_BASE } from "./env";

export interface SiteInfo {
  name: string;
  url: string;
  tagline?: string;
  locale?: string;
}

const base = (url: string) => url.replace(/\/$/, "");

/**
 * site.config with an absolute `url`: sitemaps, RSS and JSON-LD need absolute URLs, and a site scaffolded
 * without a brief has `url: ""`, so fall back to NEXT_PUBLIC_SITE_URL.
 */
export function withSiteUrl<T extends SiteInfo>(site: T): T {
  return { ...site, url: base(site.url || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000") };
}

export const postUrl = (site: SiteInfo, slug: string) => `${base(site.url)}${PUBLIC_BASE}/${slug}`;

/** `generateMetadata` for a post page: title, description, canonical, robots, Open Graph and Twitter. */
export function postMetadata(post: BlogPost, site: SiteInfo): Metadata {
  const url = postUrl(site, post.slug);
  const title = post.seo_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;
  const images = post.cover_url ? [{ url: post.cover_url, alt: post.cover_alt ?? title, width: 1200, height: 630 }] : undefined;
  return {
    // absolute: the SEO title was written to fit 60 characters, so skip the "· Site" template suffix.
    title: { absolute: title },
    description,
    keywords: [post.focus_keyword, ...post.secondary_keywords].filter((k): k is string => !!k),
    alternates: { canonical: post.canonical_url || url },
    robots: post.noindex ? { index: false, follow: true } : undefined,
    authors: post.author_name ? [{ name: post.author_name }] : [{ name: site.name }],
    openGraph: {
      type: "article",
      url,
      siteName: site.name,
      title,
      description,
      locale: site.locale,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      tags: post.tags,
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}

/** Sitemap entries for indexable live posts (merge into app/sitemap.ts). */
export function blogSitemap(posts: BlogPostSummary[], site: SiteInfo): MetadataRoute.Sitemap {
  const indexable = posts.filter((p) => !p.noindex);
  return [
    { url: `${base(site.url)}${PUBLIC_BASE}`, lastModified: indexable[0]?.updated_at, changeFrequency: "daily", priority: 0.8 },
    ...indexable.map((p) => ({
      url: postUrl(site, p.slug),
      lastModified: p.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      ...(p.cover_url ? { images: [p.cover_url] } : {}),
    })),
  ];
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed body. */
export function blogRss(posts: BlogPostSummary[], site: SiteInfo) {
  const items = posts
    .filter((p) => !p.noindex)
    .map(
      (p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${postUrl(site, p.slug)}</link>
      <guid isPermaLink="true">${postUrl(site, p.slug)}</guid>
      ${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ""}
      ${p.excerpt ? `<description>${xml(p.excerpt)}</description>` : ""}
${p.tags.map((t) => `      <category>${xml(t)}</category>`).join("\n")}
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(site.name)} Blog</title>
    <link>${base(site.url)}${PUBLIC_BASE}</link>
    <description>${xml(site.tagline || `${site.name} blog`)}</description>
    <language>${site.locale ?? "en"}</language>
    <atom:link href="${base(site.url)}${PUBLIC_BASE}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
