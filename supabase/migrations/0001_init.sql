-- 0001_init — hometask schema: rooms, tasks, allowed_emails + RLS allowlist.
--
-- Email extraction from the JWT varies by Supabase GoTrue version: modern
-- projects expose `auth.jwt() ->> 'email'`; older ones provide `auth.email()`.
-- This file targets current Supabase projects (auth.jwt()). Verify the
-- function against YOUR project's docs before applying.

-- ———————————————————————————— tables ————————————————————————————

create table if not exists public.allowed_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id text primary key,
  name text not null,
  sort_order int not null default 0,
  archived boolean not null default false
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
  -- {"title": "2026-11-13T10:00:05.000Z"}. The client merges realtime rows
  -- field-by-field using these stamps.
  field_updated_at jsonb not null default '{}'::jsonb
);

-- ———————————————————————————— updated_at triggers ————————————————————————————

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ———————————————————————————— RLS: server-side allowlist ————————————————————————————
--
-- The client-side allowlist (VITE_ALLOWED_EMAILS) is UX only. Real
-- enforcement: a row is visible/writable only when the caller's JWT email is
-- in allowed_emails. There is no per-row owner column — the allowlist gates
-- every command on every row (shared household model).

alter table public.allowed_emails enable row level security;
alter table public.rooms enable row level security;
alter table public.tasks enable row level security;

-- The allowlist itself: members may read it (so the UI can show "you're on
-- the list") and — per the plan — manage it. Tighten writes to a service
-- role / dashboard-only flow if self-service invites are not wanted.
create policy "allowlisted emails can read allowed_emails"
  on public.allowed_emails
  for select to authenticated
  using (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ));

create policy "allowlisted emails can manage allowed_emails"
  on public.allowed_emails
  for all to authenticated
  using (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ))
  with check (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ));

create policy "allowlisted emails can use rooms"
  on public.rooms
  for all to authenticated
  using (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ))
  with check (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ));

create policy "allowlisted emails can use tasks"
  on public.tasks
  for all to authenticated
  using (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ))
  with check (exists (
    select 1 from public.allowed_emails me
    where me.email = auth.jwt() ->> 'email'
  ));
