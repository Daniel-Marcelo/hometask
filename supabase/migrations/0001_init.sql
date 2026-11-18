-- 0001_init — hometask schema: rooms, tasks, allowed_emails + RLS allowlist.
--
-- Email extraction from the JWT varies by Supabase GoTrue version: modern
-- projects expose `auth.jwt() ->> 'email'`; older ones provide `auth.email()`.
-- This file targets current Supabase projects (auth.jwt()). Verify the
-- function against YOUR project's docs before applying.
--
-- RE-RUNNABLE: tables are `if not exists`; functions are `create or replace`;
-- triggers/policies are dropped first. The `tasks` LWW merge trigger was
-- reviewed by reading only (no Postgres in unit tests) — verify its behaviour
-- on the first real project run.
--
-- CLOUD MODE PREREQUISITES (important):
-- 1. Auth: every policy below is `to authenticated`. The app's auth module is
--    still a localStorage mock, so filling .env.local alone produces NO working
--    cloud mode — users must actually sign in via Supabase auth (magic link).
--    Swapping `src/lib/auth.ts` to real Supabase auth is a tracked follow-up.
-- 2. Allowlist membership: `allowed_emails` is managed ONLY via the service
--    role (RLS on, no policies → denied for anon/authenticated; the service
--    role bypasses RLS). Seed members with ALLOWED_EMAILS env var via
--    `scripts/seed-supabase.ts`, or in the dashboard SQL editor.
-- 3. Seeding note: the tasks merge trigger keeps stored values for fields
--    without newer stamps, so re-running the seed over an existing dataset
--    will NOT overwrite user-modified rows. Truncate public.tasks first if
--    you need to force a clean re-seed.

-- ———————————————————————————— tables ————————————————————————————

create table if not exists public.allowed_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  title text not null,
  status text not null check (status in ('completed', 'in_progress', 'planned', 'unplanned')),
  priority text not null check (priority in ('urgent', 'medium', 'low', 'very_low')),
  effort text not null check (effort in ('XS', 'S', 'M', 'L', 'XL')),
  effort_weight int not null check (effort_weight > 0),
  can_do_now text not null check (can_do_now in ('yes', 'no', 'na')),
  price_cents bigint,
  -- ISO date strings in TS; Postgres validates them as real dates.
  date_planned date,
  date_completed date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Per-field LWW stamps, keyed by the TS field name (camelCase), e.g.
  -- {"title": "2026-11-13T10:00:05.000Z"}. The merge trigger below uses them
  -- as the server-side LWW authority; clients also merge per field for
  -- display freshness.
  field_updated_at jsonb not null default '{}'::jsonb
);

-- ———————————————————————————— allowlist helper ————————————————————————————
--
-- SECURITY DEFINER so policy evaluation does not re-query allowed_emails
-- under its own RLS (a self-referential policy recurses: Postgres error
-- 42P17). The definer (table owner) bypasses RLS, breaking the cycle; the
-- check is a boolean so it leaks nothing but "allowed or not".

create or replace function public.is_allowed_email() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = auth.jwt() ->> 'email'
  );
$$;

-- ———————————————————————————— updated_at triggers ————————————————————————————

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ———————————————————————————— server-side LWW merge on tasks ————————————————————————————
--
-- A client flush sends a whole row, which would clobber server-newer values
-- for fields the client did not touch (including their stamps). This trigger
-- applies the incoming row ONLY where its per-field stamp is strictly newer
-- than the stored one (per field: incoming stamp > stored stamp → take
-- incoming value + stamp; else keep stored). Server state is therefore the
-- LWW authority; clients merge realtime rows per field for display freshness
-- and converge on the merged result.
--
-- Rows without stamps (the initial CSV seed) cannot be LWW-ordered: a
-- re-seed over existing rows keeps the stored values (see header note).

create or replace function public.merge_task_lww() returns trigger
language plpgsql
as $$
declare
  inc_stamps jsonb := coalesce(new.field_updated_at, '{}'::jsonb);
  stored_stamps jsonb := coalesce(old.field_updated_at, '{}'::jsonb);
  merged_stamps jsonb := stored_stamps;
begin
  -- Fresh insert (no stored row): nothing to merge against.
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Identity/history fields are owned by the stored row.
  new.created_at := old.created_at;

  -- Each block: keep the incoming field only when its stamp is strictly
  -- newer than the stored stamp; otherwise restore the stored value. Stamp
  -- keys are the TS field names (camelCase), matching what clients write.

  if coalesce(inc_stamps->>'roomId', '') > coalesce(stored_stamps->>'roomId', '') then
    merged_stamps := jsonb_set(merged_stamps, '{roomId}', inc_stamps->'roomId');
  else
    new.room_id := old.room_id;
  end if;

  if coalesce(inc_stamps->>'title', '') > coalesce(stored_stamps->>'title', '') then
    merged_stamps := jsonb_set(merged_stamps, '{title}', inc_stamps->'title');
  else
    new.title := old.title;
  end if;

  if coalesce(inc_stamps->>'status', '') > coalesce(stored_stamps->>'status', '') then
    merged_stamps := jsonb_set(merged_stamps, '{status}', inc_stamps->'status');
  else
    new.status := old.status;
  end if;

  if coalesce(inc_stamps->>'priority', '') > coalesce(stored_stamps->>'priority', '') then
    merged_stamps := jsonb_set(merged_stamps, '{priority}', inc_stamps->'priority');
  else
    new.priority := old.priority;
  end if;

  if coalesce(inc_stamps->>'effort', '') > coalesce(stored_stamps->>'effort', '') then
    merged_stamps := jsonb_set(merged_stamps, '{effort}', inc_stamps->'effort');
  else
    new.effort := old.effort;
  end if;

  if coalesce(inc_stamps->>'effortWeight', '') > coalesce(stored_stamps->>'effortWeight', '') then
    merged_stamps := jsonb_set(merged_stamps, '{effortWeight}', inc_stamps->'effortWeight');
  else
    new.effort_weight := old.effort_weight;
  end if;

  if coalesce(inc_stamps->>'canDoNow', '') > coalesce(stored_stamps->>'canDoNow', '') then
    merged_stamps := jsonb_set(merged_stamps, '{canDoNow}', inc_stamps->'canDoNow');
  else
    new.can_do_now := old.can_do_now;
  end if;

  if coalesce(inc_stamps->>'priceCents', '') > coalesce(stored_stamps->>'priceCents', '') then
    merged_stamps := jsonb_set(merged_stamps, '{priceCents}', inc_stamps->'priceCents');
  else
    new.price_cents := old.price_cents;
  end if;

  if coalesce(inc_stamps->>'datePlanned', '') > coalesce(stored_stamps->>'datePlanned', '') then
    merged_stamps := jsonb_set(merged_stamps, '{datePlanned}', inc_stamps->'datePlanned');
  else
    new.date_planned := old.date_planned;
  end if;

  if coalesce(inc_stamps->>'dateCompleted', '') > coalesce(stored_stamps->>'dateCompleted', '') then
    merged_stamps := jsonb_set(merged_stamps, '{dateCompleted}', inc_stamps->'dateCompleted');
  else
    new.date_completed := old.date_completed;
  end if;

  if coalesce(inc_stamps->>'notes', '') > coalesce(stored_stamps->>'notes', '') then
    merged_stamps := jsonb_set(merged_stamps, '{notes}', inc_stamps->'notes');
  else
    new.notes := old.notes;
  end if;

  new.field_updated_at := merged_stamps;
  return new;
end;
$$;

drop trigger if exists tasks_lww_merge on public.tasks;
create trigger tasks_lww_merge
  before insert or update on public.tasks
  for each row execute function public.merge_task_lww();

-- ———————————————————————————— realtime publication ————————————————————————————

-- Realtime only delivers changes for tables in the supabase_realtime
-- publication; RLS is re-checked per subscriber on delivery.
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object or undefined_object then null; -- already added / no publication
end $$;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object or undefined_object then null; -- already added / no publication
end $$;

-- ———————————————————————————— RLS: server-side allowlist ————————————————————————————
--
-- The client-side allowlist (VITE_ALLOWED_EMAILS) is UX only. Real
-- enforcement: a row is visible/writable only when the caller's JWT email is
-- in allowed_emails, tested through the SECURITY DEFINER helper above (never
-- by querying allowed_emails directly — that would recurse). No per-row
-- owner: the allowlist gates every command on every row (shared household).
--
-- allowed_emails itself has NO policies: with RLS enabled and none defined,
-- anon/authenticated are denied by default; only the service role (which
-- bypasses RLS) can manage membership. See the seed script / dashboard.

alter table public.allowed_emails enable row level security;
alter table public.rooms enable row level security;
alter table public.tasks enable row level security;

-- Clean up policy names from earlier revisions of this migration, so re-running
-- it cannot leave stale rules behind.
drop policy if exists "allowlisted emails can read allowed_emails" on public.allowed_emails;
drop policy if exists "allowlisted emails can manage allowed_emails" on public.allowed_emails;
drop policy if exists "allowlisted emails can use rooms" on public.rooms;
drop policy if exists "allowlisted emails can use tasks" on public.tasks;

create policy "allowlisted emails can use rooms"
  on public.rooms
  for all to authenticated
  using (public.is_allowed_email())
  with check (public.is_allowed_email());

create policy "allowlisted emails can use tasks"
  on public.tasks
  for all to authenticated
  using (public.is_allowed_email())
  with check (public.is_allowed_email());
