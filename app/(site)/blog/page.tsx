import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, jsonLdString } from "@totalweb/blog/core";
import { getPublishedPosts, withSiteUrl } from "@totalweb/blog/server";
import { site as siteConfig } from "@/site.config";
import { Cover, PostCard, PostMeta } from "@/components/site/blog";
import { Cta } from "@/components/site/Cta";
import { ClosingBand, PageHero } from "@/components/site/sections";

const site = withSiteUrl(siteConfig);

// Posts are written by the AI writer in /admin/blog and published after review; the page refreshes every 5 minutes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Singapore property guides & market notes",
  description:
    "Plain-English guides to selling, buying and valuing HDB flats, condos and landed homes in Singapore, built on real transaction data.",
  alternates: { canonical: "/blog", types: { "application/rss+xml": "/blog/rss.xml" } },
};

export default async function BlogIndex() {
  const posts = await getPublishedPosts({ limit: 60 });
  const [lead, ...rest] = posts;
  const ld = breadcrumbJsonLd(site, [
    { name: "Home", path: "/" },
    { name: "Guides", path: "/blog" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <PageHero
        kicker="Guides & market notes"
        title={<>Know the market <em>before</em> you move.</>}
        intro="Straight answers on pricing, lease decay, timelines and costs for Singapore homeowners, written from real transactions and reviewed by our agent."
        waveFill="#ffffff"
      />

      <section className="section bg-white" aria-label="Articles">
        <div className="wrap">
          {!lead ? (
            <div className="card mx-auto max-w-2xl px-6 py-12 text-center">
              <span className="kicker">Coming soon</span>
              <p className="display mt-5 text-[28px]">The first guides are on their way.</p>
              <p className="mx-auto mt-3 max-w-md text-muted">
                In the meantime, the instant valuation shows what homes like yours have sold for recently.
              </p>
            </div>
          ) : (
            <>
              <Link href={`/blog/${lead.slug}`} className="card group grid overflow-hidden lg:grid-cols-2">
                <Cover url={lead.cover_url} alt={lead.cover_alt} className="aspect-[1200/630] lg:aspect-auto lg:h-full" priority />
                <div className="p-7 sm:p-10">
                  <span className="kicker">Latest</span>
                  <h2 className="display mt-4 text-[30px] group-hover:text-primary sm:text-[38px]">{lead.title}</h2>
                  {lead.excerpt && <p className="mt-4 text-[17px] text-muted">{lead.excerpt}</p>}
                  <PostMeta published={lead.published_at} minutes={lead.reading_minutes} />
                </div>
              </Link>

              {rest.length > 0 && (
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((p) => (
                    <li key={p.slug}>
                      <PostCard post={p} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <ClosingBand title="Curious what your home is worth" highlight="today?" text="Get an instant range from recent transactions near you, then a full report if you want the detail.">
        <Cta id="blog-closing-valuation" />
      </ClosingBand>
    </>
  );
}
