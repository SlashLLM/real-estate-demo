"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Textarea } from "@totalweb/ui";
import { blocksPublish, DESC_MAX, seoChecklist, slugify, TITLE_MAX, wordCount } from "../core/seo.ts";
import { canTransition } from "../core/status.ts";
import {
  archivePost,
  backToDraft,
  deletePost,
  publishPost,
  savePost,
  schedulePost,
  submitForReview,
  unpublishPost,
  type SavePostInput,
} from "../server/actions";
import type { BlogPost, FaqItem } from "../types";
import { Markdown } from "./Markdown";
import { PostStatusBadge, fmtDate } from "./shared";

type Form = Omit<SavePostInput, "secondary_keywords" | "tags" | "faq"> & { secondary_keywords: string; tags: string; faq: FaqItem[] };

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Review screen: edit the article and its SEO fields, see the live checklist and search preview,
 * then publish now, schedule, or send back. Publishing is blocked while any SEO error remains.
 */
export function PostEditor({
  post,
  siteUrl,
  basePath,
  revisions,
}: {
  post: BlogPost;
  siteUrl: string;
  /** Admin blog list, where the editor returns after a delete. */
  basePath: string;
  revisions: { id: string; source: "ai" | "human"; created_at: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [preview, setPreview] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [f, setF] = useState<Form>({
    id: post.id,
    title: post.title,
    slug: post.slug,
    body_md: post.body_md,
    excerpt: post.excerpt ?? "",
    seo_title: post.seo_title ?? "",
    meta_description: post.meta_description ?? "",
    focus_keyword: post.focus_keyword ?? "",
    secondary_keywords: post.secondary_keywords.join(", "),
    canonical_url: post.canonical_url ?? "",
    noindex: post.noindex,
    cover_url: post.cover_url ?? "",
    cover_alt: post.cover_alt ?? "",
    tags: post.tags.join(", "),
    category: post.category ?? "",
    author_name: post.author_name ?? "",
    faq: post.faq ?? [],
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setSaved(false);
  };

  const checks = useMemo(() => seoChecklist({ ...f, body_md: f.body_md }), [f]);
  const blocked = blocksPublish(checks);
  const seoTitle = (f.seo_title || f.title) ?? "";
  const live = post.status === "published" || post.status === "scheduled";

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const save = () =>
    savePost({ ...f, secondary_keywords: list(f.secondary_keywords), tags: list(f.tags) }).then(() => setSaved(true));
  // Every status change saves first, so the checks the server runs match what the reviewer sees.
  const saveThen = (fn: () => Promise<unknown>) =>
    run(async () => {
      if (!saved) await save();
      await fn();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="grid min-w-0 gap-4">
        <Card className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PostStatusBadge status={post.status} />
            {post.ai_generated && <Badge tone="primary">AI draft</Badge>}
            {post.status === "scheduled" && <span className="text-xs text-muted">Goes live {fmtDate(post.published_at)}</span>}
            {!saved && <span className="text-xs text-warning">Unsaved changes</span>}
            <div className="flex-1" />
            {live && (
              <a href={`/blog/${post.slug}`} target="_blank" className="text-sm text-primary underline">
                View on site ↗
              </a>
            )}
          </div>
          <div>
            <Label htmlFor="title">Title (H1)</Label>
            <Input id="title" value={f.title} onChange={(e) => set("title", e.target.value)} className="text-lg font-semibold" />
          </div>
          <div>
            <Label htmlFor="slug">URL</Label>
            <div className="flex items-center gap-1 text-sm text-muted">
              <span className="whitespace-nowrap">/blog/</span>
              <Input id="slug" value={f.slug} onChange={(e) => set("slug", e.target.value)} onBlur={() => set("slug", slugify(f.slug))} />
            </div>
            {post.status === "published" && f.slug !== post.slug && (
              <p className="mt-1 text-xs text-warning">Changing the URL of a live post breaks existing links and rankings.</p>
            )}
          </div>
        </Card>

        <Card className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body" className="mb-0">
              Article (Markdown) · {wordCount(f.body_md)} words
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? "Edit" : "Preview"}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-96 rounded-ui border border-border p-4">
              <h1 className="text-3xl font-semibold">{f.title}</h1>
              <Markdown source={f.body_md} />
            </div>
          ) : (
            <Textarea id="body" value={f.body_md} onChange={(e) => set("body_md", e.target.value)} className="min-h-[60vh] font-mono text-sm" />
          )}
        </Card>

        <Card className="grid gap-4">
          <h2 className="font-medium">FAQ (shown on the page and as FAQ rich results)</h2>
          {f.faq.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-ui border border-border p-3">
              <Input
                value={item.q}
                placeholder="Question"
                onChange={(e) => set("faq", f.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
              />
              <Textarea
                value={item.a}
                placeholder="Answer"
                onChange={(e) => set("faq", f.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => set("faq", f.faq.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => set("faq", [...f.faq, { q: "", a: "" }])}>
            Add question
          </Button>
        </Card>

        {(post.ai_notes || post.sources.length > 0) && (
          <Card className="grid gap-2 text-sm">
            <h2 className="font-medium">For the reviewer</h2>
            {post.ai_notes && <p className="whitespace-pre-wrap text-muted">{post.ai_notes}</p>}
            {post.sources.length > 0 && (
              <>
                <p className="font-medium">Sources the AI used — check facts and figures against these</p>
                <ul className="list-disc pl-5">
                  {post.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener" className="text-primary underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}
      </div>

      <aside className="grid content-start gap-4">
        <Card className="grid gap-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="button" variant="secondary" disabled={pending || saved} onClick={() => run(save)}>
            {saved ? "Saved" : "Save"}
          </Button>
          {canTransition(post.status, "in_review") && post.status !== "in_review" && (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => saveThen(() => submitForReview(post.id))}>
              Submit for review
            </Button>
          )}
          {canTransition(post.status, "published") && (
            <Button type="button" disabled={pending || blocked} onClick={() => saveThen(() => publishPost(post.id))}>
              Approve & publish now
            </Button>
          )}
          {canTransition(post.status, "scheduled") && (
            <div className="flex gap-2">
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-label="Publish at" />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || blocked || !scheduleAt}
                onClick={() => saveThen(() => schedulePost(post.id, new Date(scheduleAt).toISOString()))}
              >
                Schedule
              </Button>
            </div>
          )}
          {blocked && canTransition(post.status, "published") && <p className="text-xs text-danger">Fix the SEO errors below to publish.</p>}
          {post.status === "in_review" && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => backToDraft(post.id))}>
              Send back to draft
            </Button>
          )}
          {live && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => unpublishPost(post.id))}>
              {post.status === "scheduled" ? "Cancel schedule" : "Unpublish"}
            </Button>
          )}
          {canTransition(post.status, "archived") && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => archivePost(post.id))}>
              Archive
            </Button>
          )}
          {post.status !== "published" && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => confirm("Delete this post permanently?") && run(() => deletePost(post.id).then(() => router.push(basePath)))}
            >
              Delete
            </Button>
          )}
        </Card>

        <Card className="grid gap-3">
          <h2 className="font-medium">Search preview</h2>
          <div className="rounded-ui border border-border p-3">
            <p className="truncate text-xs text-muted">
              {siteUrl.replace(/^https?:\/\//, "")} › blog › {f.slug}
            </p>
            <p className="truncate text-lg text-primary">{seoTitle.length > TITLE_MAX ? `${seoTitle.slice(0, TITLE_MAX)}…` : seoTitle}</p>
            <p className="line-clamp-2 text-sm text-muted">{f.meta_description || f.excerpt || "Add a meta description."}</p>
          </div>
          <Field label={`SEO title (${(f.seo_title ?? "").length}/${TITLE_MAX})`}>
            <Input value={f.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value)} placeholder={f.title} />
          </Field>
          <Field label={`Meta description (${(f.meta_description ?? "").length}/${DESC_MAX})`}>
            <Textarea value={f.meta_description ?? ""} onChange={(e) => set("meta_description", e.target.value)} />
          </Field>
          <Field label="Focus keyword">
            <Input value={f.focus_keyword ?? ""} onChange={(e) => set("focus_keyword", e.target.value)} />
          </Field>
          <Field label="Secondary keywords (comma separated)">
            <Input value={f.secondary_keywords} onChange={(e) => set("secondary_keywords", e.target.value)} />
          </Field>
          <Field label="Excerpt (blog index and RSS)">
            <Textarea value={f.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} />
          </Field>
        </Card>

        <Card className="grid gap-1">
          <h2 className="mb-1 font-medium">SEO checklist</h2>
          {checks.map((c) => (
            <p key={c.id} className={`text-sm ${c.ok ? "text-muted" : c.level === "error" ? "text-danger" : "text-warning"}`}>
              {c.ok ? "✓" : c.level === "error" ? "✕" : "!"} {c.msg}
            </p>
          ))}
        </Card>

        <Card className="grid gap-3">
          <h2 className="font-medium">Social & indexing</h2>
          <Field label="Cover image URL (og:image, 1200×630)">
            <Input value={f.cover_url ?? ""} onChange={(e) => set("cover_url", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Cover alt text">
            <Input value={f.cover_alt ?? ""} onChange={(e) => set("cover_alt", e.target.value)} />
          </Field>
          <Field label="Tags (comma separated)">
            <Input value={f.tags} onChange={(e) => set("tags", e.target.value)} />
          </Field>
          <Field label="Author">
            <Input value={f.author_name ?? ""} onChange={(e) => set("author_name", e.target.value)} placeholder="Defaults to the business" />
          </Field>
          <Field label="Canonical URL (only if first published elsewhere)">
            <Input value={f.canonical_url ?? ""} onChange={(e) => set("canonical_url", e.target.value)} placeholder="https://" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.noindex} onChange={(e) => set("noindex", e.target.checked)} />
            Hide from search engines (noindex)
          </label>
        </Card>

        {revisions.length > 0 && (
          <Card className="grid gap-1 text-sm">
            <h2 className="mb-1 font-medium">History</h2>
            {revisions.map((r) => (
              <p key={r.id} className="text-muted">
                {r.source === "ai" ? "AI draft" : "Edited"} · {fmtDate(r.created_at)}
              </p>
            ))}
          </Card>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
