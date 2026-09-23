create table if not exists public.rematech_suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id),
  author_name text not null,
  title text not null check (length(title) between 3 and 160),
  body text not null check (length(body) between 3 and 4000),
  status text not null default 'pendiente' check (status in ('pendiente','en_revision','implementada','descartada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rematech_suggestions enable row level security;
revoke all on public.rematech_suggestions from anon, authenticated;
grant all on public.rematech_suggestions to service_role;
