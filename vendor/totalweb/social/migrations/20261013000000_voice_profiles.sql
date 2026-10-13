-- Voice profiles: how the brand writes (tone + example lines, sent to the engine as brand.voice) and which narrator
-- voice its videos use. One profile per workspace is the default; content generation (manual and autopilot) uses it
-- unless a specific profile is chosen.

create table public.voice_profiles (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null,
  description    text not null default '',      -- tone and style, in plain words
  examples       text[] not null default '{}',  -- sample lines written in this voice
  narrator_voice text not null default 'af_heart',
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.voice_profiles (workspace_id);
create unique index voice_profiles_one_default on public.voice_profiles (workspace_id) where is_default;
create trigger voice_profiles_updated before update on public.voice_profiles for each row execute function set_updated_at();

alter table public.voice_profiles enable row level security;
create policy "voice_profiles: members read" on public.voice_profiles for select using (is_workspace_member(workspace_id));
create policy "voice_profiles: admins write" on public.voice_profiles for all
  using (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]))
  with check (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]));
