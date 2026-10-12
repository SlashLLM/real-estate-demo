-- =============================================================================
-- @totalweb/crm: companies, contacts, pipelines, deals, activities, tasks, tags, lead forms
-- =============================================================================

create type public.crm_lifecycle as enum ('subscriber','lead','mql','sql','opportunity','customer','evangelist','other');
create type public.crm_activity_type as enum ('note','call','email','meeting','form_submission','social','system');
create type public.crm_task_status as enum ('open','done','cancelled');
create type public.crm_deal_status as enum ('open','won','lost');

create table public.crm_companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  domain        text,
  industry      text,
  size          text,
  phone         text,
  address       text,
  custom_fields jsonb not null default '{}'::jsonb,
  owner_id      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.crm_companies (workspace_id, name);
create unique index crm_companies_domain_uq on public.crm_companies (workspace_id, lower(domain)) where domain is not null;

create table public.crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  company_id       uuid references public.crm_companies(id) on delete set null,
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  job_title        text,
  lifecycle_stage  public.crm_lifecycle not null default 'lead',
  source           text,                                -- 'website_form' | 'social' | 'import' | 'manual'
  source_detail    jsonb not null default '{}'::jsonb,  -- utm params, social post id, form id
  custom_fields    jsonb not null default '{}'::jsonb,
  owner_id         uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.crm_contacts (workspace_id, created_at desc);
create unique index crm_contacts_email_uq on public.crm_contacts (workspace_id, lower(email)) where email is not null;

create table public.crm_pipelines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.crm_pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id  uuid not null references public.crm_pipelines(id) on delete cascade,
  name         text not null,
  position     int not null,
  probability  int not null default 0 check (probability between 0 and 100),
  kind         public.crm_deal_status not null default 'open'   -- won/lost stages close the deal
);
create index on public.crm_pipeline_stages (pipeline_id, position);

create table public.crm_deals (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id    uuid not null references public.crm_pipelines(id) on delete cascade,
  stage_id       uuid not null references public.crm_pipeline_stages(id) on delete restrict,
  title          text not null,
  amount         numeric(14,2) not null default 0,
  currency       text not null default 'USD',
  status         public.crm_deal_status not null default 'open',
  contact_id     uuid references public.crm_contacts(id) on delete set null,
  company_id     uuid references public.crm_companies(id) on delete set null,
  owner_id       uuid references auth.users(id) on delete set null,
  expected_close date,
  closed_at      timestamptz,
  position       double precision not null default 0,   -- ordering inside a kanban column
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.crm_deals (workspace_id, stage_id, position);

create table public.crm_activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type         public.crm_activity_type not null,
  subject      text,
  body         text,
  occurred_at  timestamptz not null default now(),
  contact_id   uuid references public.crm_contacts(id) on delete cascade,
  company_id   uuid references public.crm_companies(id) on delete cascade,
  deal_id      uuid references public.crm_deals(id) on delete cascade,
  meta         jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.crm_activities (contact_id, occurred_at desc);
create index on public.crm_activities (deal_id, occurred_at desc);
create index on public.crm_activities (company_id, occurred_at desc);

create table public.crm_tasks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null,
  notes        text,
  due_at       timestamptz,
  status       public.crm_task_status not null default 'open',
  assignee_id  uuid references auth.users(id) on delete set null,
  contact_id   uuid references public.crm_contacts(id) on delete cascade,
  deal_id      uuid references public.crm_deals(id) on delete cascade,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.crm_tasks (workspace_id, status, due_at);

create table public.crm_tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  color        text not null default '#6b6b66',
  unique (workspace_id, name)
);
create table public.crm_contact_tags (
  contact_id   uuid not null references public.crm_contacts(id) on delete cascade,
  tag_id       uuid not null references public.crm_tags(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- Lead capture forms embedded on public websites
create table public.crm_lead_forms (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  name              text not null,
  fields            jsonb not null default '[{"name":"first_name","label":"First name","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"phone","label":"Phone","type":"tel"},{"name":"message","label":"Message","type":"textarea"}]'::jsonb,
  success_message   text not null default 'Thanks! We will be in touch shortly.',
  default_lifecycle public.crm_lifecycle not null default 'lead',
  auto_create_deal  boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table public.crm_form_submissions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  form_id      uuid not null references public.crm_lead_forms(id) on delete cascade,
  contact_id   uuid references public.crm_contacts(id) on delete set null,
  payload      jsonb not null,
  meta         jsonb not null default '{}'::jsonb,   -- page url, utm, user agent, ip hash
  created_at   timestamptz not null default now()
);
create index on public.crm_form_submissions (form_id, created_at desc);
create index on public.crm_form_submissions ((meta->>'ip_hash'), created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger crm_companies_updated before update on public.crm_companies for each row execute function set_updated_at();
create trigger crm_contacts_updated  before update on public.crm_contacts  for each row execute function set_updated_at();
create trigger crm_deals_updated     before update on public.crm_deals     for each row execute function set_updated_at();
create trigger crm_tasks_updated     before update on public.crm_tasks     for each row execute function set_updated_at();

-- Moving a deal into a won/lost stage closes it; moving back reopens it.
create or replace function public.crm_sync_deal_status()
returns trigger language plpgsql as $$
declare stage_kind crm_deal_status;
begin
  select kind into stage_kind from crm_pipeline_stages where id = new.stage_id;
  new.status := stage_kind;
  if stage_kind <> 'open' and (tg_op = 'INSERT' or old.status = 'open') then new.closed_at := now(); end if;
  if stage_kind = 'open' then new.closed_at := null; end if;
  return new;
end $$;
create trigger crm_deals_status before insert or update of stage_id on public.crm_deals
  for each row execute function crm_sync_deal_status();

-- Keep contact.last_activity_at fresh
create or replace function public.crm_touch_contact()
returns trigger language plpgsql as $$
begin
  if new.contact_id is not null then
    update crm_contacts
       set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.contact_id;
  end if;
  return new;
end $$;
create trigger crm_activities_touch after insert on public.crm_activities
  for each row execute function crm_touch_contact();

-- Every new workspace gets a default sales pipeline and a website contact form
create or replace function public.crm_seed_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  insert into crm_pipelines (workspace_id, name, is_default) values (new.id, 'Sales', true) returning id into p;
  insert into crm_pipeline_stages (workspace_id, pipeline_id, name, position, probability, kind) values
    (new.id, p, 'New',         0, 10,  'open'),
    (new.id, p, 'Qualified',   1, 25,  'open'),
    (new.id, p, 'Proposal',    2, 50,  'open'),
    (new.id, p, 'Negotiation', 3, 75,  'open'),
    (new.id, p, 'Won',         4, 100, 'won'),
    (new.id, p, 'Lost',        5, 0,   'lost');
  insert into crm_lead_forms (workspace_id, name) values (new.id, 'Website contact form');
  return new;
end $$;
create trigger crm_on_workspace_created after insert on public.workspaces
  for each row execute function crm_seed_workspace();

-- ---------------------------------------------------------------------------
-- RLS: workspace members have full access. Public lead intake goes through the
-- service role in the API handler (with rate limiting), never through anon.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_companies','crm_contacts','crm_pipelines','crm_pipeline_stages','crm_deals',
                           'crm_activities','crm_tasks','crm_tags','crm_contact_tags','crm_lead_forms','crm_form_submissions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members" on public.%I for all using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id))', t, t);
  end loop;
end $$;

-- Pipeline summary used by the dashboard (security_invoker so RLS applies)
create view public.crm_pipeline_summary with (security_invoker = true) as
select s.workspace_id, s.pipeline_id, s.id as stage_id, s.name as stage_name, s.position, s.probability, s.kind,
       count(d.id)                                      as deal_count,
       coalesce(sum(d.amount), 0)                       as total_amount,
       coalesce(sum(d.amount * s.probability / 100.0), 0) as weighted_amount
from public.crm_pipeline_stages s
left join public.crm_deals d on d.stage_id = s.id
group by s.id;
