# @totalweb/blog

AI-written, human-approved, SEO-ready blog for TotalWeb client sites.

```
Admin → Blog → AI writer ──► ConGenEng /v1/blog/generate ──(signed callback)──► blog_posts (status: in_review)
                                                                                      │
                         person edits, checks SEO checklist, approves ◄───────────────┘
                                                                                      │
                               published / scheduled ──► /blog, /blog/[slug], sitemap.xml, rss.xml
```

- The engine only ever creates posts **in review**. Only the server actions `publishPost` / `schedulePost` make a post live, and both refuse while any `error`-level SEO check fails (`core/seo.ts`).
- Scheduled posts need no worker: public queries treat `scheduled` + `published_at <= now()` as live, and pages revalidate every 5 minutes.
- Markdown is rendered with raw HTML disabled and `rehype-sanitize`.

## Wiring (already done in `templates/site`)

| Where | What |
|---|---|
| `package.json`, `pnpm-workspace.yaml` overrides, `next.config.ts` `transpilePackages`, `globals.css` `@source` | register the package |
| `app/admin/(protected)/blog/**` | `BlogPostsPage`, `BlogGeneratePage`, `BlogEditPage`, `BlogNav` from `@totalweb/blog/pages` |
| `app/api/blog/[...path]/route.ts` | `createBlogHandlers()` → `POST engine/callback` (excluded from `proxy.ts`) |
| `app/(site)/blog/**`, `app/sitemap.ts`, `app/robots.ts` | public pages using `getPublishedPosts`, `getPublishedPost`, `postMetadata`, `articleJsonLd`, `blogSitemap`, `blogRss` |

Env: `TOTALWEB_WORKSPACE_ID` (required for the public blog; client sites share a Supabase project), `CONGEN_URL`, `CONGEN_SHARED_SECRET`, `NEXT_PUBLIC_SITE_URL`.

## Engine contract (to implement in ConGenEng)

`POST {CONGEN_URL}/v1/blog/generate`, signed like `/v1/generate` (`X-Timestamp`, `X-Signature = hex(HMAC-SHA256(secret, "${ts}.${body}"))`). Respond `{ "job_id": "..." }`, and expose progress on the existing `GET /v1/jobs/{id}`.

Request body:

```jsonc
{
  "workspace_id": "uuid",
  "job_ref": "uuid",                 // echo back in the result
  "brand": { "name": "", "niche": "", "audience": "", "voice": "", "website": "", "locale": "en" },
  "topic": "How to choose a pour-over grinder",
  "focus_keyword": "pour-over grinder", // null → research one
  "audience": "...", "tone": "...", "length_words": 1500, "notes": "...",
  "existing_posts": [{ "title": "", "slug": "", "url": "/blog/...", "focus_keyword": "", "status": "" }],
  "callback_url": "https://site/api/blog/engine/callback"
}
```

Callback body (signed the same way), also returned as `result` from `GET /v1/jobs/{id}`:

```jsonc
{
  "kind": "blog_article",
  "job_ref": "uuid",
  "status": "succeeded",              // or "failed" with "error"
  "article": {
    "title": "…", "slug": "…", "excerpt": "…",
    "body_md": "Intro with the keyword…\n\n## Section\n…",   // no H1; ≥2 H2s; internal links to existing_posts
    "seo_title": "≤60 chars", "meta_description": "70–160 chars",
    "focus_keyword": "…", "secondary_keywords": ["…"],
    "faq": [{ "q": "…", "a": "…" }],
    "outline": [], "sources": [{ "title": "…", "url": "https://…" }],
    "tags": ["…"], "category": "…",
    "notes": "What the reviewer should double-check (claims, prices, dates)."
  }
}
```

Suggested pipeline (`app/pipeline/blog.py`): search-intent brief and keyword choice (avoid `existing_posts` keywords) → outline (H2/H3 + FAQ) → draft → SEO pass → self-check against the same rules as `seoChecklist` and repair → structured output (Pydantic) so the site never parses free text.
