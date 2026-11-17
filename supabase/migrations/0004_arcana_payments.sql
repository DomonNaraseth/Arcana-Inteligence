-- ARCANA INTELLIGENCE — payments (credit purchases through a hosted checkout)
--
-- Money never moves inside this database: a payment row records an intent, the
-- provider (Stripe) collects the money on its own hosted page, and credits are
-- granted only by arcana_fulfill_payment() once the provider confirms payment.
-- Fulfilment is idempotent and bound to the checkout session, amount and
-- currency that were recorded when the intent was created.

create table if not exists public.arcana_payments (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  provider text not null check (provider in ('stripe')),
  provider_session_id text unique,
  provider_payment_ref text,
  package_id text not null,
  package_name text not null,
  credits integer not null check (credits > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'thb',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists arcana_payments_user_created_idx
  on public.arcana_payments (user_key, created_at desc);
create index if not exists arcana_payments_status_created_idx
  on public.arcana_payments (status, created_at desc);

create table if not exists public.arcana_payment_events (
  provider text not null,
  event_id text not null,
  type text not null,
  payment_id uuid,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.arcana_payments enable row level security;
alter table public.arcana_payment_events enable row level security;
revoke all on public.arcana_payments from anon, authenticated;
revoke all on public.arcana_payment_events from anon, authenticated;

-- ── user side ────────────────────────────────────────────────────────────
create or replace function public.arcana_create_payment(
  p_provider text, p_package_id text, p_package_name text, p_credits integer,
  p_amount_minor integer, p_currency text, p_livemode boolean, p_require_account boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  recent integer;
  new_id uuid;
begin
  if not public.arcana_is_server() or k is null then
    raise exception 'arcana: not allowed' using errcode = '42501';
  end if;
  if coalesce(p_require_account, false) and auth.uid() is null then
    raise exception 'arcana: account required';
  end if;
  if p_credits is null or p_credits < 1 or p_credits > 100000
     or p_amount_minor is null or p_amount_minor < 1000 or p_amount_minor > 100000000
     or lower(coalesce(p_currency, '')) <> 'thb' then
    raise exception 'arcana: invalid payment';
  end if;
  select count(*) into recent
  from public.arcana_payments
  where user_key = k and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'arcana: too many payment attempts';
  end if;
  insert into public.arcana_payments
    (user_key, provider, package_id, package_name, credits, amount_minor, currency, livemode)
  values (k, p_provider, left(p_package_id, 40), left(p_package_name, 80), p_credits,
          p_amount_minor, 'thb', coalesce(p_livemode, false))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.arcana_attach_payment_session(p_id uuid, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.arcana_is_server() then
    return false;
  end if;
  update public.arcana_payments
  set provider_session_id = p_session_id, updated_at = now()
  where id = p_id
    and user_key = public.arcana_user_key()
    and status = 'pending'
    and provider_session_id is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.arcana_my_payment(p_id uuid)
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
  return (
    select jsonb_build_object(
      'id', id, 'status', status, 'credits', credits, 'amount_minor', amount_minor,
      'currency', currency, 'package_name', package_name,
      'provider_session_id', provider_session_id, 'created_at', created_at, 'paid_at', paid_at)
    from public.arcana_payments
    where id = p_id and user_key = public.arcana_user_key());
end;
$$;

create or replace function public.arcana_my_payments(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
    from (
      select id, status, credits, amount_minor, currency, package_name, created_at, paid_at
      from public.arcana_payments
      where user_key = public.arcana_user_key()
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 10), 1), 50)) p);
end;
$$;

-- ── fulfilment (called only after the provider has confirmed payment) ────
create or replace function public.arcana_fulfill_payment(
  p_id uuid, p_session_id text, p_amount_minor integer, p_currency text, p_payment_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.arcana_payments%rowtype;
  n integer;
begin
  if not public.arcana_is_server() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into p from public.arcana_payments where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p.provider_session_id is null or p.provider_session_id is distinct from p_session_id then
    return jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  end if;
  if p.status = 'paid' then
    return jsonb_build_object('ok', true, 'credited', 0, 'status', 'paid');
  end if;
  if p.status = 'refunded' then
    return jsonb_build_object('ok', false, 'reason', 'refunded');
  end if;
  if p_amount_minor is distinct from p.amount_minor or lower(coalesce(p_currency, '')) <> p.currency then
    insert into public.arcana_error_logs (user_key, route, code, message)
    values (public.arcana_user_ref(p.user_key), '/api/billing', 'payment_amount_mismatch',
            'payment ' || p.id::text || ': expected ' || p.amount_minor || ' ' || p.currency ||
            ', provider reported ' || coalesce(p_amount_minor::text, 'null') || ' ' || coalesce(p_currency, 'null'));
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  -- a late success after 'expired' / 'failed' still counts: the money arrived
  update public.arcana_payments
  set status = 'paid', paid_at = now(), provider_payment_ref = left(p_payment_ref, 120), updated_at = now()
  where id = p.id;

  insert into public.arcana_credit_transactions
    (user_key, amount, kind, idempotency_key, note, created_by)
  values (p.user_key, p.credits, 'purchase', 'payment:' || p.id::text,
          p.package_name, 'system:' || p.provider)
  on conflict (user_key, idempotency_key) do nothing;
  get diagnostics n = row_count;

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values ('system:' || p.provider, 'payment_paid', public.arcana_user_ref(p.user_key),
          jsonb_build_object('payment_id', p.id, 'package', p.package_name, 'credits', p.credits,
                             'amount_minor', p.amount_minor, 'currency', p.currency,
                             'livemode', p.livemode));

  return jsonb_build_object('ok', true, 'credited', case when n > 0 then p.credits else 0 end, 'status', 'paid');
end;
$$;

create or replace function public.arcana_mark_payment(p_id uuid, p_session_id text, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.arcana_is_server() or p_status not in ('failed', 'expired') then
    return false;
  end if;
  update public.arcana_payments
  set status = p_status, updated_at = now()
  where id = p_id and provider_session_id = p_session_id and status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.arcana_record_payment_event(
  p_provider text, p_event_id text, p_type text, p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.arcana_is_server() then
    return false;
  end if;
  insert into public.arcana_payment_events (provider, event_id, type, payment_id)
  values (p_provider, left(p_event_id, 120), left(p_type, 80), p_payment_id)
  on conflict (provider, event_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ── admin read models ────────────────────────────────────────────────────
create or replace function public.arcana_admin_payments(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select p.id, public.arcana_user_ref(p.user_key) as ref, u.email::text as email,
             p.package_name, p.credits, p.amount_minor, p.currency, p.status, p.livemode,
             p.provider, p.provider_payment_ref, p.created_at, p.paid_at
      from public.arcana_payments p
      left join auth.users u on p.user_key = 'u:' || u.id::text
      order by p.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)) x);
end;
$$;

create or replace function public.arcana_admin_revenue(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  perform public.arcana_require_admin();
  return jsonb_build_object(
    'paid', (
      select jsonb_build_object(
        'count', count(*),
        'revenue_minor', coalesce(sum(amount_minor), 0),
        'credits_sold', coalesce(sum(credits), 0),
        'buyers', count(distinct user_key),
        'test_count', count(*) filter (where not livemode),
        'test_revenue_minor', coalesce(sum(amount_minor) filter (where not livemode), 0))
      from public.arcana_payments where status = 'paid' and paid_at >= since),
    'pending', (select count(*) from public.arcana_payments where status = 'pending' and created_at >= since),
    'unsuccessful', (select count(*) from public.arcana_payments where status in ('failed', 'expired') and created_at >= since),
    'by_package', (
      select coalesce(jsonb_agg(jsonb_build_object('key', package_name, 'count', c, 'revenue_minor', r) order by r desc), '[]'::jsonb)
      from (
        select package_name, count(*) as c, sum(amount_minor) as r
        from public.arcana_payments where status = 'paid' and paid_at >= since
        group by package_name) t));
end;
$$;

-- ── settings: allow the 'billing' key ────────────────────────────────────
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
    'models', 'prompt_addendum', 'model_prices', 'packages', 'billing'
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

-- ── guest → account claim now also moves credits, payments and tier ──────
create or replace function public.arcana_claim_guest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hdr text;
  account_key text;
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
  account_key := 'u:' || uid::text;

  perform set_config('arcana.claiming', '1', true);
  update public.arcana_readings set user_key = account_key where user_key = hdr;
  get diagnostics n = row_count;
  update public.arcana_journals set user_key = account_key where user_key = hdr;
  update public.arcana_ai_usage set user_key = account_key where user_key = hdr;
  perform set_config('arcana.claiming', '0', true);

  -- credits: keep every row; rename only keys that would collide (daily grants)
  perform pg_advisory_xact_lock(hashtext(account_key));
  update public.arcana_credit_transactions t
  set user_key = account_key,
      idempotency_key = case
        when exists (
          select 1 from public.arcana_credit_transactions x
          where x.user_key = account_key and x.idempotency_key = t.idempotency_key)
        then t.idempotency_key || ':claimed:' || t.id::text
        else t.idempotency_key
      end
  where t.user_key = hdr;

  update public.arcana_payments set user_key = account_key, updated_at = now() where user_key = hdr;

  -- subscription: the account's own tier wins; otherwise inherit the guest's
  if exists (select 1 from public.arcana_subscriptions where user_key = account_key) then
    delete from public.arcana_subscriptions where user_key = hdr;
  else
    update public.arcana_subscriptions set user_key = account_key where user_key = hdr;
  end if;

  return n;
end;
$$;

-- ── grants ───────────────────────────────────────────────────────────────
grant execute on function public.arcana_create_payment(text, text, text, integer, integer, text, boolean, boolean) to anon, authenticated;
grant execute on function public.arcana_attach_payment_session(uuid, text) to anon, authenticated;
grant execute on function public.arcana_my_payment(uuid) to anon, authenticated;
grant execute on function public.arcana_my_payments(integer) to anon, authenticated;
grant execute on function public.arcana_fulfill_payment(uuid, text, integer, text, text) to anon, authenticated;
grant execute on function public.arcana_mark_payment(uuid, text, text) to anon, authenticated;
grant execute on function public.arcana_record_payment_event(text, text, text, uuid) to anon, authenticated;
grant execute on function public.arcana_admin_payments(integer) to anon, authenticated;
grant execute on function public.arcana_admin_revenue(integer) to anon, authenticated;
