-- Nocturne initial schema.
-- Every table is owned by a user and protected by row level security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Traveller',
  timezone text not null default 'UTC',
  preferred_carriage text not null default 'rain'
    check (preferred_carriage in ('quiet', 'rain', 'tunnel', 'moon')),
  auto_tunnel boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lines (long-term goals)
-- ---------------------------------------------------------------------------
create table if not exists public.lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  target_date date,
  created_at timestamptz not null default now()
);
create index if not exists lines_user_idx on public.lines (user_id);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  deadline date,
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  remaining_minutes integer not null default 0 check (remaining_minutes >= 0),
  interest smallint not null default 3 check (interest between 1 and 5),
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  importance smallint not null default 3 check (importance between 1 and 5),
  splittable boolean not null default true,
  min_session_minutes integer not null default 25 check (min_session_minutes > 0),
  max_session_minutes integer not null default 60 check (max_session_minutes > 0),
  recurrence jsonb,
  status text not null default 'active' check (status in ('inbox', 'active', 'done')),
  line_id uuid references public.lines (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_user_idx on public.tasks (user_id, status);
create index if not exists tasks_line_idx on public.tasks (line_id);

-- ---------------------------------------------------------------------------
-- Study windows (Service Time)
-- ---------------------------------------------------------------------------
create table if not exists public.study_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week smallint check (day_of_week between 0 and 6),
  specific_date date,
  start_time time not null,
  end_time time not null,
  recurring boolean not null default true,
  enabled boolean not null default true,
  kind text not null default 'available' check (kind in ('available', 'blocked')),
  check (end_time > start_time),
  check ((recurring and day_of_week is not null) or (not recurring and specific_date is not null))
);
create index if not exists study_windows_user_idx on public.study_windows (user_id);

-- ---------------------------------------------------------------------------
-- Study sessions (stations)
-- ---------------------------------------------------------------------------
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  sequence integer not null default 0,
  station_name text not null default '',
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  planned_minutes integer not null,
  work_minutes integer not null,
  completed_minutes integer not null default 0,
  credited_minutes integer not null default 0,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'done', 'partial', 'skipped')),
  locked boolean not null default false,
  actual_start timestamptz,
  actual_end timestamptz,
  elapsed_seconds integer not null default 0,
  resumed_at timestamptz,
  focus_before text check (focus_before in ('low', 'steady', 'sharp')),
  focus_after text check (focus_after in ('low', 'steady', 'sharp'))
);
create index if not exists study_sessions_user_date_idx on public.study_sessions (user_id, date);
create index if not exists study_sessions_task_idx on public.study_sessions (task_id);

-- ---------------------------------------------------------------------------
-- Journeys and tickets
-- ---------------------------------------------------------------------------
create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  phase text not null default 'boarding'
    check (phase in ('boarding', 'cabin', 'stop', 'paused', 'final')),
  platform text not null default '01',
  car text not null default '01',
  seat text not null default '1A',
  planned_minutes integer not null default 0,
  focused_minutes integer not null default 0,
  stations_planned integer not null default 0,
  stations_completed integer not null default 0,
  route_changes integer not null default 0,
  selected_carriage text not null default 'rain',
  selected_ambience text not null default 'rain-window',
  planned_departure timestamptz,
  planned_arrival timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  stop_ends_at timestamptz,
  focus text not null default 'steady' check (focus in ('low', 'steady', 'sharp')),
  focus_log jsonb not null default '[]'::jsonb,
  change_log jsonb not null default '[]'::jsonb,
  unique (user_id, date)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  generated_at timestamptz not null default now(),
  ticket_style text not null default 'rain',
  serial text not null,
  unique (journey_id)
);

-- ---------------------------------------------------------------------------
-- Row level security: a traveller only ever sees their own rows.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.lines enable row level security;
alter table public.tasks enable row level security;
alter table public.study_windows enable row level security;
alter table public.study_sessions enable row level security;
alter table public.journeys enable row level security;
alter table public.tickets enable row level security;

create policy "profiles are private" on public.profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['lines', 'tasks', 'study_windows', 'study_sessions', 'journeys', 'tickets'] loop
    execute format(
      'create policy "%1$s are private" on public.%1$I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

-- Create a profile row when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'Traveller'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
