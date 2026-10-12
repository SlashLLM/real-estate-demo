import type { FaqItem } from "../types";

export interface JsonLdSite {
  name: string;
  url: string;
  logo?: string;
}

interface ArticleLike {
  slug: string;
  title: string;
  seo_title?: string | null;
  meta_description?: string | null;
  cover_url?: string | null;
  published_at: string | null;
  updated_at: string;
  author_name?: string | null;
  focus_keyword?: string | null;
  secondary_keywords?: string[];
}

const base = (url: string) => url.replace(/\/$/, "");

export function articleJsonLd(post: ArticleLike, site: JsonLdSite) {
  const url = `${base(site.url)}/blog/${post.slug}`;
  const keywords = [post.focus_keyword, ...(post.secondary_keywords ?? [])].filter(Boolean).join(", ");
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo_title || post.title,
    description: post.meta_description ?? undefined,
    image: post.cover_url ? [post.cover_url] : undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    author: post.author_name ? { "@type": "Person", name: post.author_name } : { "@type": "Organization", name: site.name, url: base(site.url) },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: base(site.url),
      ...(site.logo ? { logo: { "@type": "ImageObject", url: site.logo } } : {}),
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    keywords: keywords || undefined,
  };
}

export function breadcrumbJsonLd(site: JsonLdSite, crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${base(site.url)}${c.path}` })),
  };
}

export function faqJsonLd(faq: FaqItem[] | null | undefined) {
  if (!faq?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** Safe to drop into <script type="application/ld+json"> (no `</script>` breakout). */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
