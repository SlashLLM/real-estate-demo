import type { MetadataRoute } from "next";
import { blogSitemap, getPublishedPosts, withSiteUrl } from "@totalweb/blog/server";
import { site as siteConfig } from "@/site.config";

const site = withSiteUrl(siteConfig);
const base = site.url;

// Re-generated hourly so newly published blog posts appear without a deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/valuation", "/sell", "/buy", "/about", "/contact"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" || p === "/valuation" ? ("daily" as const) : ("monthly" as const),
    priority: p === "" ? 1 : p === "/valuation" ? 0.9 : 0.6,
  }));
  return [...pages, ...blogSitemap(await getPublishedPosts({ limit: 5000 }), site)];
}
