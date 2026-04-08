create extension if not exists pgcrypto;

create table if not exists public.game_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  viewer_name text not null,
  genre text,
  estimated_hours integer,
  desired_format text,
  reference_url text,
  reason text not null,
  notes text,
  priority_points integer not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','collecting','scheduled','live','done','dropped','rejected')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_requests_status on public.game_requests(status);
create index if not exists idx_game_requests_created_at on public.game_requests(created_at desc);
create index if not exists idx_game_requests_priority on public.game_requests(priority_points desc);

alter table public.game_requests enable row level security;

drop policy if exists "public can read visible requests" on public.game_requests;
create policy "public can read visible requests"
  on public.game_requests
  for select
  using (status <> 'rejected');

drop policy if exists "public can insert requests" on public.game_requests;
create policy "public can insert requests"
  on public.game_requests
  for insert
  with check (true);

drop policy if exists "authenticated users can update requests" on public.game_requests;
create policy "authenticated users can update requests"
  on public.game_requests
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated users can delete requests" on public.game_requests;
create policy "authenticated users can delete requests"
  on public.game_requests
  for delete
  using (auth.role() = 'authenticated');
