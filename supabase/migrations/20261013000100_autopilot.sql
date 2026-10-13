-- Autopilot: on an admin-chosen interval, ask the engine for its recommended content (blog articles, social posts,
-- social videos), write it in the chosen voice and publish/schedule it without review. A schedule per kind and
-- workspace; each firing is a run whose items (engine jobs, posts, video projects) the tick advances until done.
-- Generation jobs created by a run carry request.autopilot = {scheduleId, runId}.

create table public.autopilot_schedules (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  kind                 text not null check (kind in ('blog', 'social')),
  enabled              boolean not null default false,
  interval_hours       int not null default 24 check (interval_hours between 1 and 720),
  next_run_at          timestamptz,
  last_run_at          timestamptz,
  voice_profile_id     uuid references public.voice_profiles(id) on delete set null,  -- null: the default voice
  config               jsonb not null default '{}',
  consecutive_failures int not null default 0,
  last_error           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, kind)
);
create index on public.autopilot_schedules (next_run_at) where enabled;
create trigger autopilot_schedules_updated before update on public.autopilot_schedules for each row execute function set_updated_at();

create table public.autopilot_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  schedule_id  uuid not null references public.autopilot_schedules(id) on delete cascade,
  kind         text not null,
  status       text not null default 'running',  -- running | done | partial | failed
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ends_at      timestamptz not null,              -- started_at + interval: content is spread up to here
  config       jsonb not null default '{}',       -- the schedule's config when the run started
  voice_profile_id uuid,
  items        jsonb not null default '[]',       -- [{kind, ref, state, postId?, error?}]
  error        text
);
create index on public.autopilot_runs (schedule_id, started_at desc);
create index on public.autopilot_runs (status) where status = 'running';

-- Claims due schedules and moves their next_run_at one interval on (from now, so a long outage doesn't fire a backlog).
-- `ws` limits it to one workspace: client sites share a project, and each site runs only its own schedules.
create or replace function public.autopilot_claim_due(batch int default 5, ws uuid default null)
returns setof public.autopilot_schedules language sql security definer set search_path = public as $$
  update autopilot_schedules s
     set next_run_at = now() + make_interval(hours => s.interval_hours), last_run_at = now()
   where s.id in (
     select id from autopilot_schedules
      where enabled and next_run_at is not null and next_run_at <= now() and (ws is null or workspace_id = ws)
      order by next_run_at
      limit batch
      for update skip locked
   )
  returning s.*;
$$;
revoke execute on function public.autopilot_claim_due(int, uuid) from public, anon, authenticated;

alter table public.autopilot_schedules enable row level security;
alter table public.autopilot_runs enable row level security;
create policy "autopilot_schedules: members read" on public.autopilot_schedules for select using (is_workspace_member(workspace_id));
create policy "autopilot_schedules: admins write" on public.autopilot_schedules for all
  using (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]))
  with check (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]));
create policy "autopilot_runs: members read" on public.autopilot_runs for select using (is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Tick every 5 minutes. The work runs in the site (it shares the engine bridge with the admin), so pg_net calls
-- the site's route. Set once per project, besides the social secrets:
--   select vault.create_secret('<https://www.client-site.com>', 'site_url');
-- With several client sites on one project, give each its own cron job pointing at its own URL instead.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.autopilot_invoke_site()
returns void language plpgsql security definer set search_path = public as $$
declare base text; secret text;
begin
  if not exists (select 1 from autopilot_schedules where enabled) and not exists (select 1 from autopilot_runs where status = 'running') then
    return;
  end if;
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'site_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null then return; end if;  -- not configured
  perform net.http_post(
    url := rtrim(base, '/') || '/api/autopilot/cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', coalesce(secret,'')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;

select cron.schedule('autopilot-tick', '*/5 * * * *', $$select public.autopilot_invoke_site()$$);
