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

alter table public.game_requests enable row level security;

create policy "public can read non-rejected requests"
  on public.game_requests
  for select
  using (status <> 'rejected');

create policy "public can insert requests"
  on public.game_requests
  for insert
  with check (true);

create policy "authenticated users can update requests"
  on public.game_requests
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "authenticated users can delete requests"
  on public.game_requests
  for delete
  using (auth.role() = 'authenticated');
