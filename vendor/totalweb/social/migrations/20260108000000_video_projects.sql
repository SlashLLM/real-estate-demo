-- Video director projects: a film made from the product's real screens, in two steps.
--   proposing → proposed (three concepts, scripts, voice samples; the client picks, edits, approves)
--   → building → done (the film is in social_media_assets) | failed
-- One project per video. A batch video draft links its project through draft_id.

create table public.social_video_projects (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  draft_id           uuid references public.social_generated_drafts(id) on delete set null,
  title              text,
  status             text not null default 'proposing',  -- proposing | proposed | building | done | failed
  request            jsonb not null default '{}'::jsonb,  -- format, aspect, length_s, goal, focus, platforms, use_logins
  proposal           jsonb,                               -- engine proposal: treatment, checks, voices, screens, research
  approval           jsonb,                               -- {concept, script[], voice, captions}
  proposal_job_id    text,                                -- engine job id of step 1 (= the engine's proposal id)
  build_job_id       text,                                -- engine job id of step 2
  media_id           uuid references public.social_media_assets(id) on delete set null,
  result             jsonb,                               -- qa, disclosures, capture, duration, size, seconds
  cost               jsonb not null default '{}'::jsonb,  -- {proposal_usd, build_usd, total_usd, stages}
  error              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.social_video_projects (workspace_id, created_at desc);
create index on public.social_video_projects (proposal_job_id);
create index on public.social_video_projects (build_job_id);

create trigger social_video_projects_updated before update on public.social_video_projects for each row execute function set_updated_at();

alter table public.social_video_projects enable row level security;
create policy "social_video_projects: members" on public.social_video_projects
  for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
