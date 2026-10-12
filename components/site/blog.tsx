import Link from "next/link";
import type { BlogPostSummary } from "@totalweb/blog";
import { site } from "@/site.config";

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(site.locale, { day: "numeric", month: "long", year: "numeric" }) : "";

export function PostMeta({ published, minutes, by }: { published: string | null; minutes: number | null; by?: string }) {
  return (
    <p className="mt-5 text-[14px] font-semibold text-muted">
      {by && <>{by} · </>}
      {published && <time dateTime={published}>{fmtDate(published)}</time>}
      {minutes ? ` · ${minutes} min read` : ""}
    </p>
  );
}

/** Cover image, or a branded placeholder so cards keep their rhythm when a post has none. */
export function Cover({ url, alt, className = "", priority }: { url: string | null; alt: string | null; className?: string; priority?: boolean }) {
  if (!url) {
    return (
      <div className={`sky flex items-center justify-center ${className}`} aria-hidden>
        <span className="num text-[44px] text-primary/30">PP</span>
      </div>
    );
  }
  // Covers are remote (Supabase storage, public bucket); the aspect ratio fixes their box, so there's no layout shift.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt ?? ""} loading={priority ? "eager" : "lazy"} decoding="async" className={`w-full object-cover ${className}`} />;
}

/** Article card for the index grid and "Keep reading". */
export function PostCard({ post, headingLevel = "h2" }: { post: BlogPostSummary; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <Link href={`/blog/${post.slug}`} className="card group flex h-full flex-col overflow-hidden">
      <Cover url={post.cover_url} alt={post.cover_alt} className="aspect-[1200/630]" />
      <div className="flex flex-1 flex-col p-6">
        {post.tags[0] && <span className="caps text-[10.5px] text-accent-dark">{post.tags[0]}</span>}
        <H className="mt-2 text-[20px] font-extrabold leading-snug tracking-tight group-hover:text-primary">{post.title}</H>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-[15.5px] text-muted">{post.excerpt}</p>}
        <div className="mt-auto">
          <PostMeta published={post.published_at} minutes={post.reading_minutes} />
        </div>
      </div>
    </Link>
  );
}
