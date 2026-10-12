import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@totalweb/blog/components";
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, jsonLdString } from "@totalweb/blog/core";
import { getPublishedPost, getPublishedPosts, getRelatedPosts, postMetadata, withSiteUrl } from "@totalweb/blog/server";
import { site as siteConfig } from "@/site.config";
import { agent } from "@/components/site/agent";
import { Cover, PostCard, PostMeta } from "@/components/site/blog";
import { Cta } from "@/components/site/Cta";
import { ClosingBand, Faq, Wave } from "@/components/site/sections";

const site = withSiteUrl(siteConfig);

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

/** Posts without a named author are by the agent: a named, CEA-registered expert is the stronger trust signal. */
async function load(slug: string) {
  const post = await getPublishedPost(slug);
  return post && { ...post, author_name: post.author_name || agent.name };
}

export async function generateStaticParams() {
  return (await getPublishedPosts({ limit: 500 })).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await load((await params).slug);
  return post ? postMetadata(post, site) : { title: "Article not found", robots: { index: false } };
}

export default async function BlogPostPage({ params }: Props) {
  const post = await load((await params).slug);
  if (!post) notFound();
  const related = await getRelatedPosts(post);

  const ld = [
    articleJsonLd(post, site),
    breadcrumbJsonLd(site, [
      { name: "Home", path: "/" },
      { name: "Guides", path: "/blog" },
      { name: post.title, path: `/blog/${post.slug}` },
    ]),
    faqJsonLd(post.faq),
  ].filter(Boolean);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />

      <section className="sky relative overflow-hidden">
        <div className="wrap max-w-[860px] pb-24 pt-32 sm:pb-28 sm:pt-36">
          <nav aria-label="Breadcrumb" className="text-[14px] font-semibold text-muted">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span aria-hidden> / </span>
            <Link href="/blog" className="hover:text-primary">Guides</Link>
          </nav>
          {post.tags[0] && <span className="kicker rise mt-6">{post.tags[0]}</span>}
          <h1 className="display rise mt-5 text-[38px] sm:text-[54px]">{post.title}</h1>
          {post.excerpt && <p className="rise-2 mt-5 text-[18px] text-muted">{post.excerpt}</p>}
          <PostMeta by={post.author_name} published={post.published_at} minutes={post.reading_minutes} />
        </div>
        <Wave fill="#ffffff" />
      </section>

      <article className="bg-white pb-20">
        <div className="wrap max-w-[860px]">
          {post.cover_url && (
            <Cover url={post.cover_url} alt={post.cover_alt} className="aspect-[1200/630] rounded-[24px] border-2 border-border" priority />
          )}
          <Markdown source={post.body_md} className="mt-10 text-[17.5px] [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h3]:font-extrabold" />

          <aside className="card mt-14 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8" aria-label="About the author">
            <div className="num flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-lime text-[24px]" aria-hidden>
              {agent.initials}
            </div>
            <div className="flex-1">
              <p className="font-extrabold">{agent.name}</p>
              <p className="text-[15px] text-muted">
                {agent.role} · CEA {agent.ceaReg}. Prices every home from real transactions and explains every number.
              </p>
            </div>
            <Cta id="blog-post-closing-valuation" size="sm" />
          </aside>
        </div>
      </article>

      {post.faq.length > 0 && (
        <section className="section wash" aria-labelledby="faq-title">
          <div className="wrap">
            <h2 id="faq-title" className="display mb-10 text-center text-[32px] sm:text-[42px]">
              Questions people <em>also ask</em>
            </h2>
            <Faq items={post.faq} />
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="section bg-white" aria-labelledby="related-title">
          <div className="wrap">
            <h2 id="related-title" className="display text-[30px] sm:text-[38px]">
              Keep reading
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug}>
                  <PostCard post={p} headingLevel="h3" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <ClosingBand title="See what homes like yours" highlight="sold for." text="An instant range from recent HDB, condo and landed transactions near you. Free, and no one calls unless you ask.">
        <Cta id="blog-post-closing-valuation" />
      </ClosingBand>
    </>
  );
}
