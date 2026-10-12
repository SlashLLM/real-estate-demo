-- =============================================================================
-- @totalweb/social: connected accounts, posts, per-platform targets, media,
-- metrics snapshots, AI generation jobs/drafts (ConGenEng), competitors.
-- =============================================================================

create type public.social_platform as enum ('youtube','tiktok','instagram','facebook','x','linkedin','threads','pinterest');
create type public.social_post_status as enum ('draft','scheduled','publishing','published','partially_published','failed');
create type public.social_target_status as enum ('pending','publishing','processing','published','failed','cancelled');

create table public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  platform         public.social_platform not null,
  external_id      text not null,                 -- channel id / page id / ig user id / urn ...
  name             text not null,
  username         text,
  avatar_url       text,
  -- AES-256-GCM ciphertext of the TokenSet JSON (see core/crypto.ts). Never exposed to the browser.
  token_ciphertext text not null,
  token_expires_at timestamptz,
  settings         jsonb not null default '{}'::jsonb,  -- e.g. pinterest default board, linkedin author urn
  status           text not null default 'active',      -- active | expired | revoked | error
  last_error       text,
  connected_by     uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

-- Browser-safe projection (no token column). Clients read accounts through this view.
create view public.social_accounts_public with (security_invoker = true) as
select id, workspace_id, platform, external_id, name, username, avatar_url, settings, status, last_error,
       token_expires_at, created_at
from public.social_accounts;

create table public.social_media_assets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  storage_path  text not null,                 -- "<workspace_id>/<uuid>.<ext>" in bucket "media"
  kind          text not null check (kind in ('image','video')),
  mime          text not null,
  size_bytes    bigint,
  width         int,
  height        int,
  duration_s    numeric,
  source        text not null default 'upload',   -- upload | ai_generated | url
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table public.social_posts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  content       text not null default '',
  title         text,                              -- YouTube / Pinterest titles
  link          text,
  media_ids     uuid[] not null default '{}',      -- social_media_assets, ordered
  tags          text[] not null default '{}',
  status        public.social_post_status not null default 'draft',
  scheduled_at  timestamptz,
  published_at  timestamptz,
  topic         text,                              -- free label; used by the engine's analytics
  format        text,                              -- text | image | carousel | video | short
  source        text not null default 'manual',    -- manual | ai
  draft_id      uuid,                              -- generated_drafts.id when created from AI
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.social_posts (workspace_id, scheduled_at);

create table public.social_post_targets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  post_id        uuid not null references public.social_posts(id) on delete cascade,
  account_id     uuid not null references public.social_accounts(id) on delete cascade,
  platform       public.social_platform not null,
  content_override text,                            -- platform-specific copy (else post.content)
  options        jsonb not null default '{}'::jsonb, -- privacy, category, board_id, disable_duet, ...
  status         public.social_target_status not null default 'pending',
  scheduled_at   timestamptz,                        -- copied from post when scheduled
  attempts       int not null default 0,
  next_attempt_at timestamptz,
  external_id    text,
  external_url   text,
  published_at   timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (post_id, account_id)
);
create index social_targets_due_idx on public.social_post_targets (status, scheduled_at)
  where status in ('pending','processing');

create table public.social_post_metrics (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  target_id     uuid not null references public.social_post_targets(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  impressions   bigint,
  reach         bigint,
  views         bigint,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  saves         bigint,
  clicks        bigint,
  watch_time_s  numeric,
  raw           jsonb not null default '{}'::jsonb
);
create index on public.social_post_metrics (target_id, captured_at desc);

create table public.social_account_metrics (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  account_id    uuid not null references public.social_accounts(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  followers     bigint,
  following     bigint,
  posts_count   bigint,
  raw           jsonb not null default '{}'::jsonb
);
create index on public.social_account_metrics (account_id, captured_at desc);

-- Latest metrics per target (what dashboards and the content engine read)
create view public.social_post_performance with (security_invoker = true) as
select t.id as target_id, t.workspace_id, t.post_id, t.platform, t.account_id, t.external_url, t.published_at,
       p.content, p.title, p.topic, p.format, p.tags, p.media_ids, p.source,
       m.captured_at, m.impressions, m.reach, m.views, m.likes, m.comments, m.shares, m.saves, m.clicks, m.watch_time_s
from public.social_post_targets t
join public.social_posts p on p.id = t.post_id
left join lateral (
  select * from public.social_post_metrics pm where pm.target_id = t.id order by captured_at desc limit 1
) m on true
where t.status = 'published';

-- ---------------------------------------------------------------------------
-- Content Generation Engine bridge
-- ---------------------------------------------------------------------------
create table public.social_generation_jobs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  engine_job_id text unique,
  status        text not null default 'queued',  -- queued | running | succeeded | failed
  request       jsonb not null,                  -- what we asked for (platforms, goals, count, want_video)
  insights      jsonb,                           -- analytics summary returned by the engine
  error         text,
  requested_by  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create table public.social_generated_drafts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  job_id        uuid not null references public.social_generation_jobs(id) on delete cascade,
  platform      public.social_platform not null,
  content       text not null,
  title         text,
  hashtags      text[] not null default '{}',
  suggested_at  timestamptz,
  rationale     text,
  idea          jsonb not null default '{}'::jsonb,
  media_ids     uuid[] not null default '{}',
  status        text not null default 'pending',   -- pending | approved | rejected
  post_id       uuid references public.social_posts(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on public.social_generated_drafts (workspace_id, status, created_at desc);

create table public.social_competitors (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  website       text,
  handles       jsonb not null default '{}'::jsonb,   -- {instagram: "...", x: "..."}
  summary       jsonb not null default '{}'::jsonb,   -- top topics, cadence, sample posts
  source        text not null default 'engine',      -- engine | manual
  pinned        boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger social_accounts_updated before update on public.social_accounts for each row execute function set_updated_at();
create trigger social_posts_updated    before update on public.social_posts    for each row execute function set_updated_at();
create trigger social_targets_updated  before update on public.social_post_targets for each row execute function set_updated_at();

-- Roll target statuses up into the parent post's status.
create or replace function public.social_rollup_post_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare total int; done int; failed int; active int;
begin
  select count(*),
         count(*) filter (where status = 'published'),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status in ('publishing','processing'))
    into total, done, failed, active
  from social_post_targets where post_id = new.post_id and status <> 'cancelled';

  update social_posts set
    status = case
      when total = 0 then status
      when done = total then 'published'
      when active > 0 then 'publishing'
      when failed = total then 'failed'
      when done > 0 and done + failed = total then 'partially_published'
      else status end,
    published_at = case when done > 0 and published_at is null then now() else published_at end
  where id = new.post_id and status <> 'draft';
  return new;
end $$;
create trigger social_targets_rollup after update of status on public.social_post_targets
  for each row execute function social_rollup_post_status();

-- Claim due targets atomically (used by the publisher worker; service role only).
create or replace function public.social_claim_due_targets(batch int default 20)
returns setof public.social_post_targets language sql security definer set search_path = public as $$
  update social_post_targets t set status = 'publishing', attempts = attempts + 1
  where t.id in (
    select id from social_post_targets
    where (status = 'pending' and scheduled_at <= now() and (next_attempt_at is null or next_attempt_at <= now()))
    order by scheduled_at
    limit batch
    for update skip locked
  )
  returning t.*;
$$;
revoke execute on function public.social_claim_due_targets(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS. Tokens: members may insert/update via server code using the service role;
-- the browser only reads social_accounts_public, so token_ciphertext is never selected client-side.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['social_media_assets','social_posts','social_post_targets','social_post_metrics',
                           'social_account_metrics','social_generation_jobs','social_generated_drafts','social_competitors']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members" on public.%I for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))', t, t);
  end loop;
end $$;

alter table public.social_accounts enable row level security;
create policy "social_accounts: members read" on public.social_accounts for select using (is_workspace_member(workspace_id));
create policy "social_accounts: admins delete" on public.social_accounts for delete
  using (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]));
-- Column-level guard: authenticated users cannot read the ciphertext even with a direct select.
-- (A column revoke is ineffective while a table-wide grant exists, so grant only safe columns.)
revoke select on public.social_accounts from anon, authenticated;
grant select (id, workspace_id, platform, external_id, name, username, avatar_url, settings, status, last_error,
              token_expires_at, connected_by, created_at, updated_at)
  on public.social_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- Schedules (pg_cron + pg_net). Set these once per project:
--   select vault.create_secret('<https://PROJECT.supabase.co>', 'project_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.social_invoke_function(fn text)
returns void language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null then return; end if;  -- not configured (e.g. fresh local db)
  perform net.http_post(
    url := base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', coalesce(secret,'')),
    body := '{}'::jsonb
  );
end $$;

select cron.schedule('social-publish-due',   '* * * * *',  $$select public.social_invoke_function('social-publish-due')$$);
select cron.schedule('social-sync-metrics',  '17 * * * *', $$select public.social_invoke_function('social-sync-metrics')$$);
