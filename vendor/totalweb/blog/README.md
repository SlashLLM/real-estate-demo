# @totalweb/blog

AI-written, human-approved, SEO-ready blog for TotalWeb client sites.

```
Admin → Blog → AI writer ──► ConGenEng /v1/blog/generate ──(signed callback)──► blog_posts (status: in_review)
                                                                                      │
                         person edits, checks SEO checklist, approves ◄───────────────┘
                                                                                      │
                               published / scheduled ──► /blog, /blog/[slug], sitemap.xml, rss.xml
```

- The engine only ever creates posts **in review**. The server actions `publishPost` / `schedulePost` make a post live, and both refuse while any `error`-level SEO check fails (`core/seo.ts`). The one exception is **Autopilot** (below), which publishes articles its schedule ordered without review, behind the same checklist.
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

## Autopilot (`@totalweb/blog/autopilot`)

Admin → Autopilot: one schedule for blog articles and one for social posts per workspace. On each interval a run asks
the engine for its **recommended** content, written in the chosen **voice profile** (default: the workspace's default
voice), and publishes it with no review:

- **Blog:** `topic: null`, so the engine picks the next article to rank for. Articles are ordered one at a time, each avoiding the topics before it. Each goes live through `autoPublishPost`, spread over the interval. Derivable SEO gaps are filled first; an article that still fails the checklist stays in review and the run marks it *needs attention*.
- **Social:** one `/v1/generate` job. Each draft is scheduled on the chosen accounts at the engine's suggested time, clamped into the interval. Video drafts get the recommended concept approved with the voice's narrator, and are posted once built.
- **Runs:** runs never overlap. A schedule pauses itself after 3 failed runs in a row. Run history is shown on the page.

| Where | What |
|---|---|
| `migrations/20261013000100_autopilot.sql` | `autopilot_schedules`, `autopilot_runs`, `autopilot_claim_due()`, pg_cron `autopilot-tick` (every 5 min) |
| `packages/social/migrations/20261013000000_voice_profiles.sql` | `voice_profiles` (writing voice + narrator voice, one default) |
| `app/admin/(protected)/autopilot/page.tsx`, `…/autopilot/voices/page.tsx` | `AutopilotPage`, `AutopilotVoicesPage` from `@totalweb/blog/autopilot/pages` |
| `app/api/autopilot/[...path]/route.ts` | `createAutopilotHandlers()` → `POST cron` with `x-cron-secret: CRON_SECRET` (excluded from `proxy.ts`) |

The tick runs in the site, not in an Edge Function, because it shares the engine bridge with the admin. Point pg_cron at
the site once per project: `select vault.create_secret('https://www.client-site.com', 'site_url');`. The site needs
`CRON_SECRET` set, with the same value as the Vault `cron_secret`. On Vercel or any other host, an external scheduler
calling `POST /api/autopilot/cron` every 5 minutes works too.

## Engine contract (to implement in ConGenEng)

`POST {CONGEN_URL}/v1/blog/generate`, signed like `/v1/generate` (`X-Timestamp`, `X-Signature = hex(HMAC-SHA256(secret, "${ts}.${body}"))`). Respond `{ "job_id": "..." }`, and expose progress on the existing `GET /v1/jobs/{id}`.

Request body:

```jsonc
{
  "workspace_id": "uuid",
  "job_ref": "uuid",                 // echo back in the result
  "brand": { "name": "", "niche": "", "audience": "", "voice": "", "website": "", "locale": "en" },
  "topic": "How to choose a pour-over grinder", // null → the engine recommends one (autopilot)
  "avoid_topics": [],                 // topics being written right now
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
