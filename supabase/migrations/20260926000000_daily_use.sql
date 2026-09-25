-- Daily-use refinements.
-- 1. Deleted tasks with history are archived so past journeys stay intact.
-- 2. Service windows may cross midnight (e.g. 22:00–01:00) or sit after it.

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check check (status in ('inbox', 'active', 'done', 'archived'));

-- The original table-level check required end_time > start_time.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.study_windows'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%end_time > start_time%'
  loop
    execute format('alter table public.study_windows drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.study_windows
  add constraint study_windows_not_empty check (end_time <> start_time);
