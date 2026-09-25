-- Language, first-run setup and personalization switches on the profile;
-- the traveller's own estimate next to a calibrated one; how each station ended.

alter table public.profiles
  add column if not exists locale text not null default 'en' check (locale in ('en', 'ko', 'ja', 'zh')),
  add column if not exists onboarded_at timestamptz,
  add column if not exists learn_from_sessions boolean not null default true,
  add column if not exists auto_adjust_estimates boolean not null default true,
  add column if not exists use_focus_history boolean not null default true;

alter table public.tasks
  add column if not exists user_estimated_minutes integer check (user_estimated_minutes is null or user_estimated_minutes >= 0);

alter table public.study_sessions
  add column if not exists ended_by text check (
    ended_by is null or ended_by in ('complete', 'early', 'early-all', 'low-focus', 'ended', 'removed', 'skipped', 'unreached')
  ),
  add column if not exists extended_minutes integer not null default 0;
