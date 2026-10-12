-- =============================================================================
-- TotalWeb foundation: profiles, workspaces (tenants), membership, RLS helpers.
-- Every module table carries workspace_id and uses is_workspace_member() in RLS.
-- =============================================================================

create extension if not exists pgcrypto;

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  settings    jsonb not null default '{}'::jsonb,   -- brand profile etc. (used by the content engine)
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.workspace_role not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so policies don't recurse into workspace_members)
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.has_workspace_role(ws uuid, roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = any(roles)
  );
$$;

-- Generic updated_at trigger used by module tables
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- New user => profile + personal workspace (owner)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ws_id uuid;
  display text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
begin
  insert into profiles (id, full_name, avatar_url)
  values (new.id, display, new.raw_user_meta_data->>'avatar_url');

  insert into workspaces (name, slug, created_by)
  values (display || '''s workspace', lower(regexp_replace(display, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8), new.id)
  returning id into ws_id;

  insert into workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "profiles: self read"   on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from workspace_members a join workspace_members b using (workspace_id)
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy "profiles: self update" on public.profiles for update using (id = auth.uid());

create policy "workspaces: members read" on public.workspaces for select using (is_workspace_member(id));
create policy "workspaces: admins update" on public.workspaces for update
  using (has_workspace_role(id, array['owner','admin']::workspace_role[]));

create policy "members: read" on public.workspace_members for select using (is_workspace_member(workspace_id));
create policy "members: admins manage" on public.workspace_members for all
  using (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]))
  with check (has_workspace_role(workspace_id, array['owner','admin']::workspace_role[]));
-- Creating a workspace goes through this RPC so the creator becomes owner atomically.
create or replace function public.create_workspace(ws_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare ws_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into workspaces (name, slug, created_by)
  values (ws_name, lower(regexp_replace(ws_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 6), auth.uid())
  returning id into ws_id;
  insert into workspace_members (workspace_id, user_id, role) values (ws_id, auth.uid(), 'owner');
  return ws_id;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private "media" bucket, objects namespaced by "<workspace_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

create policy "media: members read" on storage.objects for select
  using (bucket_id = 'media' and is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "media: members write" on storage.objects for insert
  with check (bucket_id = 'media' and is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "media: members delete" on storage.objects for delete
  using (bucket_id = 'media' and is_workspace_member(((storage.foldername(name))[1])::uuid));
