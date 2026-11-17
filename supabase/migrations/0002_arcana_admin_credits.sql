-- ARCANA INTELLIGENCE — admin (RBAC), runtime settings, audit, credits, subscriptions
--
-- None of these tables has an RLS policy: they are reachable only through the
-- SECURITY DEFINER functions below, each of which checks arcana_is_server()
-- and, for admin operations, arcana_is_admin().

-- ── tables ───────────────────────────────────────────────────────────────
create table if not exists public.arcana_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.arcana_audit_logs (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists arcana_audit_logs_created_idx
  on public.arcana_audit_logs (created_at desc);

create table if not exists public.arcana_error_logs (
  id bigint generated always as identity primary key,
  user_key text,
  route text,
  code text not null,
  message text,
  created_at timestamptz not null default now()
);
create index if not exists arcana_error_logs_created_idx
  on public.arcana_error_logs (created_at desc);

create table if not exists public.arcana_credit_transactions (
  id bigint generated always as identity primary key,
  user_key text not null,
  amount integer not null,
  kind text not null check (kind in ('daily_grant', 'admin_grant', 'purchase', 'spend', 'refund')),
  feature text,
  reading_id uuid,
  idempotency_key text not null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (user_key, idempotency_key),
  check (kind <> 'spend' or amount < 0)
);
create index if not exists arcana_credit_tx_user_created_idx
  on public.arcana_credit_transactions (user_key, created_at desc);

create table if not exists public.arcana_subscriptions (
  user_key text primary key,
  tier text not null default 'free' check (tier in ('free', 'basic', 'premium', 'unlimited')),
  status text not null default 'active' check (status in ('active', 'canceled', 'expired')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.arcana_settings enable row level security;
alter table public.arcana_audit_logs enable row level security;
alter table public.arcana_error_logs enable row level security;
alter table public.arcana_credit_transactions enable row level security;
alter table public.arcana_subscriptions enable row level security;

revoke all on public.arcana_settings from anon, authenticated;
revoke all on public.arcana_audit_logs from anon, authenticated;
revoke all on public.arcana_error_logs from anon, authenticated;
revoke all on public.arcana_credit_transactions from anon, authenticated;
revoke all on public.arcana_subscriptions from anon, authenticated;

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function public.arcana_header(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return (current_setting('request.headers', true))::json ->> p_name;
exception when others then
  return null;
end;
$$;

/** Public, non-secret reference for a user. Guest tokens are never exposed. */
create or replace function public.arcana_user_ref(p_user_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_user_key like 'u:%' then p_user_key
    else 'g#' || left(encode(sha256(convert_to(p_user_key, 'UTF8')), 'hex'), 16)
  end
$$;

-- ── RBAC ─────────────────────────────────────────────────────────────────
/**
 * Role of the caller: 'owner' | 'admin' | null.
 *   owner — the operator access key, or a signed-in account on owner_emails.
 *           Owners manage the admin list; everything an admin can do, too.
 *   admin — a signed-in account on admin_emails.
 */
create or replace function public.arcana_admin_role()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hdr text;
  expected text;
  emails text;
  mail text;
begin
  if not public.arcana_is_server() then
    return null;
  end if;

  -- operator access key (httpOnly cookie → x-arcana-admin header)
  hdr := public.arcana_header('x-arcana-admin');
  if hdr is not null and length(hdr) >= 32 then
    select value into expected from public.arcana_server_config where key = 'admin_key_sha256';
    if expected is not null and encode(sha256(convert_to(hdr, 'UTF8')), 'hex') = expected then
      return 'owner';
    end if;
  end if;

  -- signed-in account whose verified email is on a role list
  if auth.uid() is not null then
    mail := lower(coalesce(auth.jwt() ->> 'email', ''));
    if mail <> '' then
      select value into emails from public.arcana_server_config where key = 'owner_emails';
      if emails is not null and exists (
        select 1 from jsonb_array_elements_text(emails::jsonb) e where lower(e) = mail
      ) then
        return 'owner';
      end if;
      select value into emails from public.arcana_server_config where key = 'admin_emails';
      if emails is not null and exists (
        select 1 from jsonb_array_elements_text(emails::jsonb) e where lower(e) = mail
      ) then
        return 'admin';
      end if;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.arcana_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.arcana_admin_role() is not null
$$;

create or replace function public.arcana_require_owner()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.arcana_admin_role() is distinct from 'owner' then
    raise exception 'arcana: owner only' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.arcana_admin_actor()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is not null and mail <> '' then
    return 'email:' || mail;
  end if;
  return 'admin-key';
end;
$$;

create or replace function public.arcana_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_admin() then
    raise exception 'arcana: admin only' using errcode = '42501';
  end if;
end;
$$;

/** Verifies an operator key. Locks out after repeated failures. */
create or replace function public.arcana_admin_login(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text;
  failures integer;
begin
  if not public.arcana_is_server() then
    return 'invalid';
  end if;
  select count(*) into failures
  from public.arcana_error_logs
  where code = 'admin_login_failed' and created_at > now() - interval '15 minutes';
  if failures >= 10 then
    return 'locked';
  end if;
  select value into expected from public.arcana_server_config where key = 'admin_key_sha256';
  if expected is not null
     and p_key is not null
     and length(p_key) >= 32
     and encode(sha256(convert_to(p_key, 'UTF8')), 'hex') = expected then
    insert into public.arcana_audit_logs (actor, action) values ('admin-key', 'admin_login');
    return 'ok';
  end if;
  insert into public.arcana_error_logs (route, code, message)
  values ('/api/admin/session', 'admin_login_failed', 'invalid operator key');
  return 'invalid';
end;
$$;

-- ── settings ─────────────────────────────────────────────────────────────
create or replace function public.arcana_public_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return null;
  end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.arcana_settings);
end;
$$;

create or replace function public.arcana_admin_set_setting(p_key text, p_value jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_value jsonb;
begin
  perform public.arcana_require_admin();
  if p_key not in (
    'reversal_probability', 'limits', 'credits', 'disabled_spreads',
    'models', 'prompt_addendum', 'model_prices', 'packages'
  ) then
    raise exception 'arcana: unknown setting %', p_key;
  end if;
  select value into old_value from public.arcana_settings where key = p_key;
  insert into public.arcana_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), public.arcana_admin_actor())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'set_setting', p_key,
          jsonb_build_object('old', old_value, 'new', p_value));
  return true;
end;
$$;

create or replace function public.arcana_admin_get_admin_emails()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  admins text;
  owners text;
begin
  perform public.arcana_require_admin();
  select value into admins from public.arcana_server_config where key = 'admin_emails';
  select value into owners from public.arcana_server_config where key = 'owner_emails';
  return jsonb_build_object(
    'role', public.arcana_admin_role(),
    'owners', coalesce(owners::jsonb, '[]'::jsonb),
    'admins', coalesce(admins::jsonb, '[]'::jsonb));
end;
$$;

/** Only an owner may change who the admins are. The owner list is not editable here. */
create or replace function public.arcana_admin_set_admin_emails(p_emails jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_owner();
  if jsonb_typeof(p_emails) <> 'array' or jsonb_array_length(p_emails) > 20 then
    raise exception 'arcana: invalid admin email list';
  end if;
  insert into public.arcana_server_config (key, value)
  values ('admin_emails', p_emails::text)
  on conflict (key) do update set value = excluded.value;
  insert into public.arcana_audit_logs (actor, action, detail)
  values (public.arcana_admin_actor(), 'set_admin_emails',
          jsonb_build_object('count', jsonb_array_length(p_emails)));
  return true;
end;
$$;

-- ── error log ────────────────────────────────────────────────────────────
create or replace function public.arcana_log_error(p_route text, p_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return;
  end if;
  insert into public.arcana_error_logs (user_key, route, code, message)
  values (public.arcana_user_ref(public.arcana_user_key()), left(p_route, 200),
          left(p_code, 60), left(p_message, 600));
end;
$$;

-- ── credits & subscriptions ──────────────────────────────────────────────
create or replace function public.arcana_active_tier(p_user_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tier from public.arcana_subscriptions
      where user_key = p_user_key
        and status = 'active'
        and (current_period_end is null or current_period_end > now())),
    'free')
$$;

/**
 * Wallet for the calling user. When credits are enabled it also performs the
 * once-per-day top-up: the balance is raised to the tier's daily allowance
 * (credits above the allowance — purchased or granted — are preserved).
 */
create or replace function public.arcana_wallet()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  cfg jsonb;
  enabled boolean;
  tier text;
  daily integer;
  bal integer;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  idem text;
begin
  if not public.arcana_is_server() or k is null then
    return null;
  end if;
  select value into cfg from public.arcana_settings where key = 'credits';
  enabled := coalesce((cfg ->> 'enabled')::boolean, false);
  tier := public.arcana_active_tier(k);
  daily := coalesce(
    (cfg -> 'daily_free' ->> tier)::integer,
    case tier when 'basic' then 10 when 'premium' then 30 when 'unlimited' then 150 else 3 end);

  if enabled then
    perform pg_advisory_xact_lock(hashtext(k));
    idem := 'daily:' || today::text;
    if not exists (
      select 1 from public.arcana_credit_transactions
      where user_key = k and idempotency_key = idem
    ) then
      select coalesce(sum(amount), 0) into bal
      from public.arcana_credit_transactions where user_key = k;
      insert into public.arcana_credit_transactions
        (user_key, amount, kind, idempotency_key, note, created_by)
      values (k, greatest(daily - bal, 0), 'daily_grant', idem,
              'daily allowance (' || tier || ')', 'system');
    end if;
  end if;

  select coalesce(sum(amount), 0) into bal
  from public.arcana_credit_transactions where user_key = k;

  return jsonb_build_object(
    'enabled', enabled,
    'ref', public.arcana_user_ref(k),
    'tier', tier,
    'daily', daily,
    'balance', bal,
    'transactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'amount', t.amount, 'kind', t.kind, 'feature', t.feature,
        'note', t.note, 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from (
        select amount, kind, feature, note, created_at
        from public.arcana_credit_transactions
        where user_key = k and amount <> 0
        order by created_at desc limit 15
      ) t)
  );
end;
$$;

/** Atomic, idempotent deduction. Never drives the balance below zero. */
create or replace function public.arcana_spend_credits(
  p_amount integer, p_feature text, p_reading_id uuid, p_idem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  bal integer;
begin
  if not public.arcana_is_server() or k is null then
    return jsonb_build_object('ok', false, 'balance', 0);
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'charged', 0);
  end if;
  if p_amount > 1000 or p_idem is null or length(p_idem) < 8 then
    raise exception 'arcana: invalid spend';
  end if;
  perform pg_advisory_xact_lock(hashtext(k));
  select coalesce(sum(amount), 0) into bal
  from public.arcana_credit_transactions where user_key = k;
  if exists (
    select 1 from public.arcana_credit_transactions
    where user_key = k and idempotency_key = p_idem
  ) then
    return jsonb_build_object('ok', true, 'charged', 0, 'balance', bal);
  end if;
  if bal < p_amount then
    return jsonb_build_object('ok', false, 'charged', 0, 'balance', bal);
  end if;
  insert into public.arcana_credit_transactions
    (user_key, amount, kind, feature, reading_id, idempotency_key, created_by)
  values (k, -p_amount, 'spend', left(p_feature, 40), p_reading_id, p_idem, 'system');
  return jsonb_build_object('ok', true, 'charged', p_amount, 'balance', bal - p_amount);
end;
$$;

create or replace function public.arcana_resolve_ref(p_ref text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found text;
begin
  if p_ref like 'u:%' then
    return p_ref;
  end if;
  select k.user_key into found
  from (
    select user_key from public.arcana_readings
    union select user_key from public.arcana_credit_transactions
    union select user_key from public.arcana_subscriptions
  ) k
  where public.arcana_user_ref(k.user_key) = p_ref
  limit 1;
  return found;
end;
$$;

create or replace function public.arcana_admin_grant_credits(
  p_ref text, p_amount integer, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  bal integer;
begin
  perform public.arcana_require_admin();
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then
    raise exception 'arcana: invalid amount';
  end if;
  k := public.arcana_resolve_ref(p_ref);
  if k is null then
    raise exception 'arcana: user not found';
  end if;
  perform pg_advisory_xact_lock(hashtext(k));
  insert into public.arcana_credit_transactions
    (user_key, amount, kind, idempotency_key, note, created_by)
  values (k, p_amount, 'admin_grant', 'admin:' || gen_random_uuid()::text,
          left(p_note, 200), public.arcana_admin_actor());
  select coalesce(sum(amount), 0) into bal
  from public.arcana_credit_transactions where user_key = k;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'grant_credits', public.arcana_user_ref(k),
          jsonb_build_object('amount', p_amount, 'note', left(p_note, 200), 'balance', bal));
  return jsonb_build_object('balance', bal);
end;
$$;

create or replace function public.arcana_admin_set_tier(
  p_ref text, p_tier text, p_period_end timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  perform public.arcana_require_admin();
  if p_tier not in ('free', 'basic', 'premium', 'unlimited') then
    raise exception 'arcana: invalid tier';
  end if;
  k := public.arcana_resolve_ref(p_ref);
  if k is null then
    raise exception 'arcana: user not found';
  end if;
  insert into public.arcana_subscriptions
    (user_key, tier, status, current_period_end, updated_at, updated_by)
  values (k, p_tier, 'active', p_period_end, now(), public.arcana_admin_actor())
  on conflict (user_key) do update
    set tier = excluded.tier, status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = now(), updated_by = excluded.updated_by;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'set_tier', public.arcana_user_ref(k),
          jsonb_build_object('tier', p_tier, 'period_end', p_period_end));
  return true;
end;
$$;

-- ── admin read models ────────────────────────────────────────────────────
create or replace function public.arcana_admin_users(p_search text, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  term text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.arcana_require_admin();
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result
  from (
    select
      public.arcana_user_ref(k.user_key) as ref,
      case when k.user_key like 'u:%' then 'account' else 'guest' end as kind,
      u.email::text as email,
      coalesce(r.readings, 0) as readings,
      r.last_active,
      coalesce(b.balance, 0) as balance,
      public.arcana_active_tier(k.user_key) as tier
    from (
      select user_key from public.arcana_readings
      union select user_key from public.arcana_credit_transactions
      union select user_key from public.arcana_subscriptions
    ) k
    left join lateral (
      select count(*) as readings, max(created_at) as last_active
      from public.arcana_readings where user_key = k.user_key
    ) r on true
    left join lateral (
      select sum(amount) as balance
      from public.arcana_credit_transactions where user_key = k.user_key
    ) b on true
    left join auth.users u on k.user_key = 'u:' || u.id::text
    where term is null
       or public.arcana_user_ref(k.user_key) ilike '%' || term || '%'
       or u.email ilike '%' || term || '%'
    order by r.last_active desc nulls last
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) x;
  return result;
end;
$$;

create or replace function public.arcana_admin_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  today date := (now() at time zone 'Asia/Bangkok')::date;
  result jsonb;
begin
  perform public.arcana_require_admin();
  select jsonb_build_object(
    'days', d,
    'period', (
      select jsonb_build_object(
        'readings', count(*),
        'interpreted', count(*) filter (where status = 'interpreted'),
        'users', count(distinct user_key),
        'accounts', count(distinct user_key) filter (where user_key like 'u:%'))
      from public.arcana_readings where created_at >= since),
    'all_time', (
      select jsonb_build_object('readings', count(*), 'users', count(distinct user_key))
      from public.arcana_readings),
    'followups', (
      select count(*) from public.arcana_messages
      where role = 'user' and created_at >= since),
    'clarifiers', (
      select count(*) from public.arcana_reading_cards
      where is_followup and created_at >= since),
    'journals', (select count(*) from public.arcana_journals where created_at >= since),
    'returning_users', (
      select count(*) from (
        select user_key from public.arcana_readings
        where created_at >= since
        group by user_key
        having count(distinct (created_at at time zone 'Asia/Bangkok')::date) >= 2) t),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', g.day, 'readings', coalesce(r.c, 0), 'users', coalesce(r.u, 0)) order by g.day), '[]'::jsonb)
      from (
        select generate_series(today - (d - 1), today, interval '1 day')::date as day) g
      left join (
        select (created_at at time zone 'Asia/Bangkok')::date as day,
               count(*) as c, count(distinct user_key) as u
        from public.arcana_readings
        where created_at >= since - interval '1 day'
        group by 1) r on r.day = g.day),
    'by_spread', (
      select coalesce(jsonb_agg(jsonb_build_object('key', spread_id, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select spread_id, count(*) as c from public.arcana_readings
        where created_at >= since group by spread_id) t),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('key', cat, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(question_analysis ->> 'category', 'unknown') as cat, count(*) as c
        from public.arcana_readings where created_at >= since group by 1) t),
    'usage', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'feature', feature, 'provider', provider, 'model', model, 'calls', calls,
        'input_tokens', it, 'output_tokens', ot) order by (it + ot) desc), '[]'::jsonb)
      from (
        select feature, provider, model, count(*) as calls,
               coalesce(sum(input_tokens), 0) as it, coalesce(sum(output_tokens), 0) as ot
        from public.arcana_ai_usage where created_at >= since
        group by feature, provider, model) t),
    'quality', (
      select jsonb_build_object(
        'total', count(*),
        'passed', count(*) filter (where quality ->> 'passed' = 'true'),
        'retried', count(*) filter (where coalesce((quality ->> 'attempts')::integer, 1) > 1))
      from public.arcana_reading_analyses where created_at >= since),
    'errors', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select code, count(*) as c from public.arcana_error_logs
        where created_at >= since group by code) t),
    'credits', (
      select jsonb_build_object(
        'granted', coalesce(sum(amount) filter (where amount > 0), 0),
        'spent', coalesce(-sum(amount) filter (where kind = 'spend'), 0))
      from public.arcana_credit_transactions where created_at >= since)
  ) into result;
  return result;
end;
$$;

create or replace function public.arcana_admin_logs(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform public.arcana_require_admin();
  return jsonb_build_object(
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from (select id, actor, action, target, detail, created_at
            from public.arcana_audit_logs order by created_at desc limit n) a),
    'errors', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
      from (select id, user_key, route, code, message, created_at
            from public.arcana_error_logs order by created_at desc limit n) e)
  );
end;
$$;

-- ── grants: every function guards itself ─────────────────────────────────
grant execute on function public.arcana_is_admin() to anon, authenticated;
grant execute on function public.arcana_admin_role() to anon, authenticated;
revoke execute on function public.arcana_require_owner() from anon, authenticated, public;
grant execute on function public.arcana_admin_login(text) to anon, authenticated;
grant execute on function public.arcana_public_settings() to anon, authenticated;
grant execute on function public.arcana_admin_set_setting(text, jsonb) to anon, authenticated;
grant execute on function public.arcana_admin_get_admin_emails() to anon, authenticated;
grant execute on function public.arcana_admin_set_admin_emails(jsonb) to anon, authenticated;
grant execute on function public.arcana_log_error(text, text, text) to anon, authenticated;
grant execute on function public.arcana_wallet() to anon, authenticated;
grant execute on function public.arcana_spend_credits(integer, text, uuid, text) to anon, authenticated;
grant execute on function public.arcana_admin_grant_credits(text, integer, text) to anon, authenticated;
grant execute on function public.arcana_admin_set_tier(text, text, timestamptz) to anon, authenticated;
grant execute on function public.arcana_admin_users(text, integer) to anon, authenticated;
grant execute on function public.arcana_admin_overview(integer) to anon, authenticated;
grant execute on function public.arcana_admin_logs(integer) to anon, authenticated;
revoke execute on function public.arcana_resolve_ref(text) from anon, authenticated, public;
revoke execute on function public.arcana_active_tier(text) from anon, authenticated, public;
revoke execute on function public.arcana_require_admin() from anon, authenticated, public;
revoke execute on function public.arcana_admin_actor() from anon, authenticated, public;
