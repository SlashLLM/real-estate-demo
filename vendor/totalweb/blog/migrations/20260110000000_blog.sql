-- Blog: AI-generated (ConGenEng) or hand-written articles, reviewed by a person before they go live.
-- Lifecycle: draft -> in_review -> scheduled | published -> archived. Generation progress lives on
-- blog_generation_jobs; a post row only exists once the engine has delivered an article.

create type public.blog_post_status as enum ('draft', 'in_review', 'scheduled', 'published', 'archived');

create table public.blog_generation_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  engine_job_id text unique,
  status        text not null default 'queued',  -- queued | running | succeeded | failed
  request       jsonb not null,                  -- topic, keyword, audience, tone, length
  error         text,
  requested_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index on public.blog_generation_jobs (workspace_id, created_at desc);

create table public.blog_posts (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  job_id             uuid references public.blog_generation_jobs(id) on delete set null,
  status             public.blog_post_status not null default 'draft',
  slug               text not null,
  title              text not null,
  excerpt            text,
  body_md            text not null default '',
  -- SEO
  seo_title          text,
  meta_description   text,
  focus_keyword      text,
  secondary_keywords text[] not null default '{}',
  canonical_url      text,
  noindex            boolean not null default false,
  cover_url          text,                         -- public URL (blog bucket), stable for og:image
  cover_alt          text,
  faq                jsonb not null default '[]',  -- [{q, a}] -> FAQPage JSON-LD
  -- What the engine based the article on, for the reviewer to fact-check
  outline            jsonb,
  sources            jsonb not null default '[]',  -- [{title, url}]
  ai_notes           text,
  tags               text[] not null default '{}',
  category           text,
  author_name        text,
  reading_minutes    int,
  ai_generated       boolean not null default false,
  -- Review trail: only a person moves a post to scheduled/published
  reviewed_by        uuid references auth.users(id) on delete set null,
  reviewed_at        timestamptz,
  published_at       timestamptz,                  -- go-live time (future when scheduled)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index on public.blog_posts (workspace_id, status, published_at desc);
create trigger blog_posts_updated before update on public.blog_posts for each row execute function set_updated_at();

-- Every save (AI delivery or human edit), so reviewers can see what changed from the AI draft.
create table public.blog_post_revisions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  post_id       uuid not null references public.blog_posts(id) on delete cascade,
  title         text not null,
  body_md       text not null,
  source        text not null check (source in ('ai', 'human')),
  edited_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.blog_post_revisions (post_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: workspace members have full access.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['blog_generation_jobs','blog_posts','blog_post_revisions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members" on public.%I for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))', t, t);
  end loop;
end $$;

-- Public site: anyone may read live posts (the site reads server-side, this is defence in depth).
create policy "blog_posts: public read live" on public.blog_posts for select to anon, authenticated
  using (status = 'published' or (status = 'scheduled' and published_at <= now()));

-- ---------------------------------------------------------------------------
-- Public bucket for cover images: <workspace_id>/<file>. Public so og:image URLs never expire.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('blog', 'blog', true)
  on conflict (id) do nothing;

create policy "blog: members write" on storage.objects for insert
  with check (bucket_id = 'blog' and is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "blog: members delete" on storage.objects for delete
  using (bucket_id = 'blog' and is_workspace_member(((storage.foldername(name))[1])::uuid));
