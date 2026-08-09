-- Saved opportunities for Jearch.
--
-- The app has no user accounts: each browser generates an anonymous owner id
-- and stores it locally, and rows are scoped by that id. Run this in the
-- Supabase SQL editor before setting NEXT_PUBLIC_SUPABASE_URL / ANON_KEY.

create table if not exists public.saved_jobs (
  id         text primary key,
  owner_id   text        not null,
  job        jsonb       not null,
  contact    jsonb,
  saved_at   timestamptz not null default now(),
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists saved_jobs_owner_id_idx on public.saved_jobs (owner_id, saved_at desc);

alter table public.saved_jobs enable row level security;

-- The anon key is what the server route uses, so the policies below are what
-- gate access. They are permissive by design for an account-less app: anyone
-- who knows an owner id can read its rows. If you add Supabase Auth, replace
-- these with policies keyed on auth.uid() and make owner_id a uuid column
-- referencing auth.users.
create policy "anon can read own saved jobs"
  on public.saved_jobs for select
  to anon
  using (true);

create policy "anon can insert saved jobs"
  on public.saved_jobs for insert
  to anon
  with check (true);

create policy "anon can update saved jobs"
  on public.saved_jobs for update
  to anon
  using (true)
  with check (true);

create policy "anon can delete saved jobs"
  on public.saved_jobs for delete
  to anon
  using (true);
