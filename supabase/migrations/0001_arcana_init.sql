-- ARCANA INTELLIGENCE — initial schema
-- All objects are prefixed arcana_ so the schema can live in a shared project.
--
-- Security model
--   * Every arcana_* table has RLS enabled.
--   * Requests must carry the server secret (x-arcana-server header) — the
--     public anon key alone can read or write nothing.
--   * Row ownership is keyed on arcana_user_key():
--       'u:<auth uid>'  for signed-in users (from the verified JWT)
--       'g:<token>'     for guest sessions (256-bit token, httpOnly cookie)
--   * Drawn cards are insert-only: no UPDATE/DELETE policy exists.

-- ── server credential ────────────────────────────────────────────────────
create table if not exists public.arcana_server_config (
  key text primary key,
  value text not null
);
alter table public.arcana_server_config enable row level security;
-- (no policies: unreachable through the API)

create or replace function public.arcana_is_server()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hdr text;
  expected text;
begin
  begin
    hdr := (current_setting('request.headers', true))::json ->> 'x-arcana-server';
  exception when others then
    return false;
  end;
  if hdr is null or length(hdr) < 32 then
    return false;
  end if;
  select value into expected
  from public.arcana_server_config
  where key = 'server_secret_sha256';
  return expected is not null
    and encode(sha256(convert_to(hdr, 'UTF8')), 'hex') = expected;
end;
$$;

create or replace function public.arcana_user_key()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hdr text;
begin
  if uid is not null then
    return 'u:' || uid::text;
  end if;
  begin
    hdr := (current_setting('request.headers', true))::json ->> 'x-arcana-key';
  exception when others then
    hdr := null;
  end;
  -- guest keys can never collide with or impersonate a 'u:' key
  if hdr is not null and hdr ~ '^g:[0-9a-f]{64}$' then
    return hdr;
  end if;
  return null;
end;
$$;

-- ── tables ───────────────────────────────────────────────────────────────
create table if not exists public.arcana_readings (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  question text not null check (char_length(question) between 1 and 1000),
  question_analysis jsonb,
  spread_id text not null,
  status text not null default 'drawn' check (status in ('drawn', 'interpreted')),
  title text,
  tendency text,
  draw_meta jsonb,
  kb_version text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_key, idempotency_key)
);
create index if not exists arcana_readings_user_created_idx
  on public.arcana_readings (user_key, created_at desc);

create table if not exists public.arcana_reading_cards (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.arcana_readings (id) on delete cascade,
  position integer not null check (position > 0),
  position_key text not null,
  card_id text not null,
  orientation text not null check (orientation in ('upright', 'reversed')),
  is_followup boolean not null default false,
  created_at timestamptz not null default now(),
  unique (reading_id, position),
  unique (reading_id, card_id)
);

create table if not exists public.arcana_reading_analyses (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.arcana_readings (id) on delete cascade,
  content jsonb not null,
  quality jsonb,
  provider text,
  model text,
  prompt_version text,
  kb_version text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists arcana_reading_analyses_reading_idx
  on public.arcana_reading_analyses (reading_id, created_at desc);

create table if not exists public.arcana_messages (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.arcana_readings (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  kind text not null default 'chat' check (kind in ('chat', 'draw')),
  created_at timestamptz not null default now()
);
create index if not exists arcana_messages_reading_idx
  on public.arcana_messages (reading_id, created_at);

create table if not exists public.arcana_journals (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  reading_id uuid references public.arcana_readings (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 8000),
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists arcana_journals_user_created_idx
  on public.arcana_journals (user_key, created_at desc);

create table if not exists public.arcana_ai_usage (
  id bigint generated always as identity primary key,
  user_key text not null,
  feature text not null,
  reading_id uuid,
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists arcana_ai_usage_user_feature_idx
  on public.arcana_ai_usage (user_key, feature, created_at desc);

-- ── integrity guard: a reading's question / spread / draw never change ───
create or replace function public.arcana_readings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question is distinct from old.question
     or new.spread_id is distinct from old.spread_id
     or new.draw_meta is distinct from old.draw_meta
     or new.created_at is distinct from old.created_at then
    raise exception 'arcana: reading core fields are immutable';
  end if;
  if new.user_key is distinct from old.user_key
     and coalesce(current_setting('arcana.claiming', true), '') <> '1' then
    raise exception 'arcana: reading owner is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists arcana_readings_guard on public.arcana_readings;
create trigger arcana_readings_guard
  before update on public.arcana_readings
  for each row execute function public.arcana_readings_guard();

-- ── row level security ───────────────────────────────────────────────────
alter table public.arcana_readings enable row level security;
alter table public.arcana_reading_cards enable row level security;
alter table public.arcana_reading_analyses enable row level security;
alter table public.arcana_messages enable row level security;
alter table public.arcana_journals enable row level security;
alter table public.arcana_ai_usage enable row level security;

drop policy if exists arcana_readings_owner on public.arcana_readings;
create policy arcana_readings_owner on public.arcana_readings
  for all to anon, authenticated
  using ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()))
  with check ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()));

drop policy if exists arcana_cards_select on public.arcana_reading_cards;
create policy arcana_cards_select on public.arcana_reading_cards
  for select to anon, authenticated
  using (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_cards_insert on public.arcana_reading_cards;
create policy arcana_cards_insert on public.arcana_reading_cards
  for insert to anon, authenticated
  with check (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_analyses_select on public.arcana_reading_analyses;
create policy arcana_analyses_select on public.arcana_reading_analyses
  for select to anon, authenticated
  using (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_analyses_insert on public.arcana_reading_analyses;
create policy arcana_analyses_insert on public.arcana_reading_analyses
  for insert to anon, authenticated
  with check (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_messages_select on public.arcana_messages;
create policy arcana_messages_select on public.arcana_messages
  for select to anon, authenticated
  using (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_messages_insert on public.arcana_messages;
create policy arcana_messages_insert on public.arcana_messages
  for insert to anon, authenticated
  with check (
    (select public.arcana_is_server())
    and exists (
      select 1 from public.arcana_readings r
      where r.id = reading_id and r.user_key = (select public.arcana_user_key())
    )
  );

drop policy if exists arcana_journals_owner on public.arcana_journals;
create policy arcana_journals_owner on public.arcana_journals
  for all to anon, authenticated
  using ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()))
  with check ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()));

drop policy if exists arcana_usage_select on public.arcana_ai_usage;
create policy arcana_usage_select on public.arcana_ai_usage
  for select to anon, authenticated
  using ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()));

drop policy if exists arcana_usage_insert on public.arcana_ai_usage;
create policy arcana_usage_insert on public.arcana_ai_usage
  for insert to anon, authenticated
  with check ((select public.arcana_is_server()) and user_key = (select public.arcana_user_key()));

-- ── guest → account claim (runs after sign-in) ───────────────────────────
create or replace function public.arcana_claim_guest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hdr text;
  n integer := 0;
begin
  if uid is null or not public.arcana_is_server() then
    return 0;
  end if;
  begin
    hdr := (current_setting('request.headers', true))::json ->> 'x-arcana-key';
  exception when others then
    return 0;
  end;
  if hdr is null or hdr !~ '^g:[0-9a-f]{64}$' then
    return 0;
  end if;
  perform set_config('arcana.claiming', '1', true);
  update public.arcana_readings set user_key = 'u:' || uid::text where user_key = hdr;
  get diagnostics n = row_count;
  update public.arcana_journals set user_key = 'u:' || uid::text where user_key = hdr;
  update public.arcana_ai_usage set user_key = 'u:' || uid::text where user_key = hdr;
  perform set_config('arcana.claiming', '0', true);
  return n;
end;
$$;

-- ── grants ───────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.arcana_readings to anon, authenticated;
grant select, insert on public.arcana_reading_cards to anon, authenticated;
grant select, insert on public.arcana_reading_analyses to anon, authenticated;
grant select, insert on public.arcana_messages to anon, authenticated;
grant select, insert, update, delete on public.arcana_journals to anon, authenticated;
grant select, insert on public.arcana_ai_usage to anon, authenticated;
revoke all on public.arcana_server_config from anon, authenticated;
grant execute on function public.arcana_is_server() to anon, authenticated;
grant execute on function public.arcana_user_key() to anon, authenticated;
grant execute on function public.arcana_claim_guest() to authenticated;
revoke execute on function public.arcana_claim_guest() from anon, public;
