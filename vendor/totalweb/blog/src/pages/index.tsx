/**
 * Admin pages (server components). Mount each in a host-app route, e.g.
 *   app/admin/(protected)/blog/page.tsx:  export { BlogPostsPage as default } from "@totalweb/blog/pages";
 */
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { Button, Card } from "@totalweb/ui";
import { BlogNav as BlogNavTabs, GeneratePanel, PostEditor, PostsTable } from "../components";
import { POST_STATUSES, STATUS_LABEL, type PostStatus } from "../core/index.ts";
import { createPost } from "../server/actions";
import { publicWorkspaceId, UI_BASE } from "../server/env";
import { countByStatus, getPost, listJobs, listPosts, listRevisions } from "../server/queries";

type SearchParams = Promise<Record<string, string | undefined>>;

export async function BlogNav({ basePath = UI_BASE }: { basePath?: string }) {
  const counts = await countByStatus().catch(() => ({}));
  return <BlogNavTabs basePath={basePath} counts={counts} />;
}

function Header({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Post list, filterable by ?status= (draft|in_review|scheduled|published|archived). */
export async function BlogPostsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).status;
  const status = (POST_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as PostStatus) : undefined;
  const [posts, ws] = await Promise.all([listPosts(status), requireWorkspace()]);
  const siteWs = publicWorkspaceId();
  return (
    <>
      {siteWs !== ws.id && (
        <Card className="mb-4 border-warning text-sm">
          {siteWs
            ? "This site shows another workspace's blog. Posts published here won't appear on it."
            : "Published posts won't appear on the site yet."}{" "}
          Set <code>TOTALWEB_WORKSPACE_ID={ws.id}</code> in the site's environment and redeploy.
        </Card>
      )}
      <Header
        title={status ? STATUS_LABEL[status] : "Blog posts"}
        actions={
          <form action={createPost}>
            <Button type="submit" variant="secondary">
              New post
            </Button>
          </form>
        }
      >
        {status === "in_review"
          ? "AI drafts and submitted posts waiting for a person to approve them."
          : "Everything on the blog. AI drafts arrive in the review queue and are only published after approval."}
      </Header>
      <PostsTable posts={posts} basePath={UI_BASE} />
    </>
  );
}

export async function BlogGeneratePage() {
  const jobs = await listJobs();
  return (
    <>
      <Header title="AI writer">
        Researches the topic, plans the article around a search keyword and writes an SEO-ready draft for review.
      </Header>
      <GeneratePanel jobs={jobs} reviewHref={`${UI_BASE}?status=in_review`} />
    </>
  );
}

export async function BlogEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id).catch(() => null);
  if (!post) notFound();
  const revisions = await listRevisions(id);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return <PostEditor post={post} siteUrl={siteUrl} basePath={UI_BASE} revisions={revisions} />;
}
