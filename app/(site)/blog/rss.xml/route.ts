import { blogRss, getPublishedPosts, withSiteUrl } from "@totalweb/blog/server";
import { site as siteConfig } from "@/site.config";

const site = withSiteUrl(siteConfig);

export const revalidate = 900;

export async function GET() {
  const posts = await getPublishedPosts({ limit: 50 });
  return new Response(blogRss(posts, site), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
