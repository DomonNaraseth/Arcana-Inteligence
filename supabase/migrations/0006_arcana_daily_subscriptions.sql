-- ARCANA INTELLIGENCE — daily card ritual, sign-up bonus, paid memberships
--
-- Daily card: one immutable draw per user per Bangkok day (the card is chosen
-- by lib/tarot/draw.ts, never by the AI or the database), a streak, and a
-- shared per-day message cache so the AI is called at most once per card and
-- orientation per day for everyone.
--
-- Memberships: a monthly subscription is a recurring credit purchase that also
-- sets the tier. The tier and the credits change only from provider-verified
-- events, through the functions below, idempotently.

-- ── schema changes ───────────────────────────────────────────────────────
alter table public.arcana_credit_transactions
  drop constraint if exists arcana_credit_transactions_kind_check;
alter table public.arcana_credit_transactions
  add constraint arcana_credit_transactions_kind_check
  check (kind in ('daily_grant', 'admin_grant', 'purchase', 'spend', 'refund', 'bonus', 'subscription'));

alter table public.arcana_payments
  add column if not exists kind text not null default 'credits',
  add column if not exists plan_id text;
alter table public.arcana_payments drop constraint if exists arcana_payments_kind_check;
alter table public.arcana_payments
  add constraint arcana_payments_kind_check check (kind in ('credits', 'subscription'));

alter table public.arcana_subscriptions
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists plan_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists source text not null default 'admin';
alter table public.arcana_subscriptions drop constraint if exists arcana_subscriptions_source_check;
alter table public.arcana_subscriptions
  add constraint arcana_subscriptions_source_check check (source in ('admin', 'stripe'));
create unique index if not exists arcana_subscriptions_provider_sub_idx
  on public.arcana_subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.arcana_daily_draws (
  id bigint generated always as identity primary key,
  user_key text not null,
  day date not null,
  card_id text not null,
  orientation text not null check (orientation in ('upright', 'reversed')),
  kb_version text,
  created_at timestamptz not null default now(),
  unique (user_key, day)
);

create table if not exists public.arcana_daily_messages (
  day date not null,
  card_id text not null,
  orientation text not null check (orientation in ('upright', 'reversed')),
  kb_version text not null,
  content jsonb not null,
  provider text,
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  primary key (day, card_id, orientation, kb_version)
);

alter table public.arcana_daily_draws enable row level security;
alter table public.arcana_daily_messages enable row level security;
revoke all on public.arcana_daily_draws from anon, authenticated;
revoke all on public.arcana_daily_messages from anon, authenticated;

-- ── wallet: one-time welcome credits ─────────────────────────────────────
/**
 * Wallet for the calling user. When credits are enabled it grants the
 * one-time welcome credits (sign-up bonus for accounts, optional trial for
 * guests) and performs the once-per-day top-up to the tier's allowance.
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
  welcome integer;
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
    case tier when 'unlimited' then 150 else 0 end);

  if enabled then
    perform pg_advisory_xact_lock(hashtext(k));

    if k like 'u:%' then
      welcome := coalesce((cfg ->> 'signup_bonus')::integer, 6);
      idem := 'signup-bonus';
    else
      welcome := coalesce((cfg ->> 'guest_trial')::integer, 0);
      idem := 'guest-trial';
    end if;
    if welcome > 0 then
      insert into public.arcana_credit_transactions
        (user_key, amount, kind, idempotency_key, note, created_by)
      values (k, least(welcome, 1000), 'bonus', idem,
              case when k like 'u:%' then 'sign-up bonus' else 'guest trial' end, 'system')
      on conflict (user_key, idempotency_key) do nothing;
    end if;

    idem := 'daily:' || today::text;
    if daily > 0 and not exists (
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

-- ── daily card ───────────────────────────────────────────────────────────
create or replace function public.arcana_daily_streak(p_user_key text, p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- consecutive days ending today: rows whose (day + rank) is constant
  select coalesce((
    select count(*)::integer
    from (
      select day, day + (row_number() over (order by day desc))::integer as grp
      from public.arcana_daily_draws
      where user_key = p_user_key and day <= p_today and day > p_today - 400
    ) s
    where grp = p_today + 1), 0)
$$;

create or replace function public.arcana_daily_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  today date := (now() at time zone 'Asia/Bangkok')::date;
  streak integer;
begin
  if not public.arcana_is_server() or k is null then
    return null;
  end if;
  streak := public.arcana_daily_streak(k, today);
  if streak = 0 then
    -- not drawn yet today: show the streak that today's draw would continue
    streak := public.arcana_daily_streak(k, today - 1);
  end if;
  return jsonb_build_object(
    'day', today,
    'today', (
      select jsonb_build_object('card_id', card_id, 'orientation', orientation, 'kb_version', kb_version)
      from public.arcana_daily_draws where user_key = k and day = today),
    'streak', streak,
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'card_id', d.card_id, 'orientation', d.orientation) order by d.day desc), '[]'::jsonb)
      from (
        select day, card_id, orientation from public.arcana_daily_draws
        where user_key = k and day < today order by day desc limit 7) d)
  );
end;
$$;

/**
 * Records today's card. Insert-only: a second call returns the card already
 * drawn. On every completed streak cycle a signed-in account earns bonus
 * credits, once per day.
 */
create or replace function public.arcana_daily_draw(
  p_card_id text, p_orientation text, p_kb_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  today date := (now() at time zone 'Asia/Bangkok')::date;
  n integer;
  streak integer;
  cfg jsonb;
  cycle integer;
  reward integer;
  granted integer := 0;
  row_card text;
  row_orientation text;
  row_kb text;
begin
  if not public.arcana_is_server() or k is null then
    raise exception 'arcana: not allowed' using errcode = '42501';
  end if;
  if p_card_id is null or p_card_id !~ '^[a-z0-9-]{3,40}$'
     or p_orientation not in ('upright', 'reversed') then
    raise exception 'arcana: invalid draw';
  end if;

  insert into public.arcana_daily_draws (user_key, day, card_id, orientation, kb_version)
  values (k, today, p_card_id, p_orientation, left(p_kb_version, 80))
  on conflict (user_key, day) do nothing;
  get diagnostics n = row_count;

  select card_id, orientation, kb_version into row_card, row_orientation, row_kb
  from public.arcana_daily_draws where user_key = k and day = today;
  streak := public.arcana_daily_streak(k, today);

  if n > 0 and k like 'u:%' then
    select value into cfg from public.arcana_settings where key = 'daily';
    cycle := coalesce((cfg ->> 'streak_days')::integer, 7);
    reward := coalesce((cfg ->> 'streak_reward')::integer, 3);
    if cycle > 0 and reward > 0 and streak % cycle = 0
       and coalesce((select (value ->> 'enabled')::boolean
                     from public.arcana_settings where key = 'credits'), false) then
      insert into public.arcana_credit_transactions
        (user_key, amount, kind, idempotency_key, note, created_by)
      values (k, least(reward, 100), 'bonus', 'streak:' || today::text,
              'daily card streak (' || streak || ' days)', 'system')
      on conflict (user_key, idempotency_key) do nothing;
      get diagnostics granted = row_count;
      granted := granted * least(reward, 100);
    end if;
  end if;

  return jsonb_build_object(
    'day', today, 'card_id', row_card, 'orientation', row_orientation, 'kb_version', row_kb,
    'is_new', n > 0, 'streak', streak, 'reward', granted);
end;
$$;

create or replace function public.arcana_daily_message_get(
  p_card_id text, p_orientation text, p_kb_version text)
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
    select content from public.arcana_daily_messages
    where day = (now() at time zone 'Asia/Bangkok')::date
      and card_id = p_card_id and orientation = p_orientation and kb_version = p_kb_version);
end;
$$;

create or replace function public.arcana_daily_message_put(
  p_card_id text, p_orientation text, p_kb_version text, p_content jsonb,
  p_provider text, p_model text, p_prompt_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not public.arcana_is_server() or public.arcana_user_key() is null then
    return null;
  end if;
  if p_card_id !~ '^[a-z0-9-]{3,40}$' or p_orientation not in ('upright', 'reversed')
     or p_content is null or jsonb_typeof(p_content) <> 'object'
     or length(p_content::text) > 6000 then
    raise exception 'arcana: invalid daily message';
  end if;
  insert into public.arcana_daily_messages
    (day, card_id, orientation, kb_version, content, provider, model, prompt_version)
  values (today, p_card_id, p_orientation, left(p_kb_version, 80), p_content,
          left(p_provider, 40), left(p_model, 80), left(p_prompt_version, 80))
  on conflict (day, card_id, orientation, kb_version) do nothing;
  -- the first writer wins, so everyone reads the same message for the day
  return (
    select content from public.arcana_daily_messages
    where day = today and card_id = p_card_id and orientation = p_orientation
      and kb_version = left(p_kb_version, 80));
end;
$$;

-- ── memberships ──────────────────────────────────────────────────────────
create or replace function public.arcana_create_subscription_payment(
  p_provider text, p_plan_id text, p_plan_name text, p_credits integer,
  p_amount_minor integer, p_livemode boolean, p_allow_guest boolean)
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
  if auth.uid() is null and not coalesce(p_allow_guest, false) then
    raise exception 'arcana: account required';
  end if;
  if p_plan_id not in ('basic', 'premium')
     or p_credits is null or p_credits < 1 or p_credits > 100000
     or p_amount_minor is null or p_amount_minor < 1000 or p_amount_minor > 100000000 then
    raise exception 'arcana: invalid payment';
  end if;
  if exists (
    select 1 from public.arcana_subscriptions
    where user_key = k and status = 'active' and source = 'stripe'
      and provider_subscription_id is not null
      and (current_period_end is null or current_period_end > now())
  ) then
    raise exception 'arcana: already subscribed';
  end if;
  select count(*) into recent
  from public.arcana_payments
  where user_key = k and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'arcana: too many payment attempts';
  end if;
  insert into public.arcana_payments
    (user_key, provider, package_id, package_name, credits, amount_minor, currency, livemode, kind, plan_id)
  values (k, p_provider, 'plan:' || p_plan_id, left(p_plan_name, 80), p_credits,
          p_amount_minor, 'thb', coalesce(p_livemode, false), 'subscription', p_plan_id)
  returning id into new_id;
  return new_id;
end;
$$;

-- fulfilment: subscription credits are labelled as such in the ledger
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
    return jsonb_build_object('ok', true, 'credited', 0, 'status', 'paid', 'kind', p.kind);
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
  values (p.user_key, p.credits,
          case when p.kind = 'subscription' then 'subscription' else 'purchase' end,
          'payment:' || p.id::text, p.package_name, 'system:' || p.provider)
  on conflict (user_key, idempotency_key) do nothing;
  get diagnostics n = row_count;

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values ('system:' || p.provider, 'payment_paid', public.arcana_user_ref(p.user_key),
          jsonb_build_object('payment_id', p.id, 'package', p.package_name, 'credits', p.credits,
                             'amount_minor', p.amount_minor, 'currency', p.currency,
                             'livemode', p.livemode, 'kind', p.kind));

  return jsonb_build_object('ok', true, 'credited', case when n > 0 then p.credits else 0 end,
                            'status', 'paid', 'kind', p.kind);
end;
$$;

/**
 * Turns a paid subscription checkout into an active membership. The payment
 * row must already be 'paid' (provider-verified); the subscription id comes
 * from the provider's own session object.
 */
create or replace function public.arcana_activate_subscription(
  p_payment_id uuid, p_subscription_id text, p_customer_id text,
  p_period_end timestamptz, p_cancel_at_period_end boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.arcana_payments%rowtype;
begin
  if not public.arcana_is_server() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into p from public.arcana_payments where id = p_payment_id;
  if not found or p.kind <> 'subscription' or p.plan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p.status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;
  if p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' or p_period_end is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_subscription');
  end if;
  if exists (
    select 1 from public.arcana_subscriptions
    where provider_subscription_id = p_subscription_id and user_key <> p.user_key
  ) then
    return jsonb_build_object('ok', false, 'reason', 'subscription_taken');
  end if;

  insert into public.arcana_subscriptions
    (user_key, tier, status, current_period_end, updated_at, updated_by, provider,
     provider_customer_id, provider_subscription_id, plan_id, cancel_at_period_end, source)
  values (p.user_key, p.plan_id, 'active', p_period_end + interval '2 days', now(), 'system:' || p.provider,
          p.provider, left(p_customer_id, 80), p_subscription_id, p.plan_id,
          coalesce(p_cancel_at_period_end, false), 'stripe')
  on conflict (user_key) do update
    set tier = excluded.tier, status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = now(), updated_by = excluded.updated_by,
        provider = excluded.provider,
        provider_customer_id = excluded.provider_customer_id,
        provider_subscription_id = excluded.provider_subscription_id,
        plan_id = excluded.plan_id,
        cancel_at_period_end = excluded.cancel_at_period_end,
        source = 'stripe';

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values ('system:' || p.provider, 'subscription_started', public.arcana_user_ref(p.user_key),
          jsonb_build_object('plan', p.plan_id, 'payment_id', p.id, 'period_end', p_period_end,
                             'livemode', p.livemode));
  return jsonb_build_object('ok', true, 'tier', p.plan_id);
end;
$$;

/** Applies a provider-reported change of state (renewal date, cancellation). */
create or replace function public.arcana_sync_subscription(
  p_subscription_id text, p_status text, p_period_end timestamptz, p_cancel_at_period_end boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.arcana_subscriptions%rowtype;
begin
  if not public.arcana_is_server() or p_status not in ('active', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into s from public.arcana_subscriptions
  where provider_subscription_id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.arcana_subscriptions
  set status = p_status,
      current_period_end = case
        when p_period_end is null then current_period_end
        else p_period_end + interval '2 days' end,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
      updated_at = now(), updated_by = 'system:stripe'
  where user_key = s.user_key;

  if s.status is distinct from p_status
     or s.cancel_at_period_end is distinct from coalesce(p_cancel_at_period_end, s.cancel_at_period_end) then
    insert into public.arcana_audit_logs (actor, action, target, detail)
    values ('system:stripe', 'subscription_changed', public.arcana_user_ref(s.user_key),
            jsonb_build_object('plan', s.plan_id, 'status', p_status,
                               'cancel_at_period_end', p_cancel_at_period_end, 'period_end', p_period_end));
  end if;
  return jsonb_build_object('ok', true, 'plan', s.plan_id);
end;
$$;

/** The plan behind a provider subscription — the server prices a renewal from it. */
create or replace function public.arcana_subscription_plan(p_subscription_id text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return null;
  end if;
  return (select plan_id from public.arcana_subscriptions
          where provider_subscription_id = p_subscription_id);
end;
$$;

/** A paid renewal invoice: records the payment, grants the month's credits, once per invoice. */
create or replace function public.arcana_renew_subscription(
  p_subscription_id text, p_invoice_id text, p_amount_minor integer, p_currency text,
  p_credits integer, p_plan_name text, p_period_end timestamptz, p_livemode boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.arcana_subscriptions%rowtype;
  new_id uuid;
begin
  if not public.arcana_is_server() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_invoice_id is null or p_invoice_id !~ '^in_[A-Za-z0-9_]+$'
     or p_credits is null or p_credits < 1 or p_credits > 100000
     or p_amount_minor is null or p_amount_minor < 1 then
    return jsonb_build_object('ok', false, 'reason', 'bad_invoice');
  end if;
  select * into s from public.arcana_subscriptions
  where provider_subscription_id = p_subscription_id for update;
  if not found or s.plan_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if exists (select 1 from public.arcana_payments where provider_session_id = p_invoice_id) then
    return jsonb_build_object('ok', true, 'credited', 0);
  end if;

  insert into public.arcana_payments
    (user_key, provider, provider_session_id, provider_payment_ref, package_id, package_name,
     credits, amount_minor, currency, status, livemode, paid_at, kind, plan_id)
  values (s.user_key, 'stripe', p_invoice_id, p_invoice_id, 'plan:' || s.plan_id, left(p_plan_name, 80),
          p_credits, p_amount_minor, lower(coalesce(p_currency, 'thb')), 'paid',
          coalesce(p_livemode, false), now(), 'subscription', s.plan_id)
  returning id into new_id;

  insert into public.arcana_credit_transactions
    (user_key, amount, kind, idempotency_key, note, created_by)
  values (s.user_key, p_credits, 'subscription', 'payment:' || new_id::text, left(p_plan_name, 80), 'system:stripe')
  on conflict (user_key, idempotency_key) do nothing;

  update public.arcana_subscriptions
  set status = 'active', tier = s.plan_id,
      current_period_end = case
        when p_period_end is null then current_period_end
        else p_period_end + interval '2 days' end,
      updated_at = now(), updated_by = 'system:stripe'
  where user_key = s.user_key;

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values ('system:stripe', 'subscription_renewed', public.arcana_user_ref(s.user_key),
          jsonb_build_object('plan', s.plan_id, 'payment_id', new_id, 'credits', p_credits,
                             'amount_minor', p_amount_minor, 'livemode', coalesce(p_livemode, false)));
  return jsonb_build_object('ok', true, 'credited', p_credits);
end;
$$;

create or replace function public.arcana_my_subscription()
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
      'tier', tier, 'status', status, 'plan_id', plan_id, 'source', source,
      'current_period_end', current_period_end, 'cancel_at_period_end', cancel_at_period_end,
      'manageable', provider_customer_id is not null,
      'active', status = 'active' and (current_period_end is null or current_period_end > now()))
    from public.arcana_subscriptions
    where user_key = public.arcana_user_key());
end;
$$;

/** Provider customer id of the caller — for the server to open the billing portal; never sent to the browser. */
create or replace function public.arcana_my_billing_customer()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return null;
  end if;
  return (select provider_customer_id from public.arcana_subscriptions
          where user_key = public.arcana_user_key() and source = 'stripe');
end;
$$;

/**
 * A fully refunded or disputed credit purchase: marks the payment and takes
 * back the unspent part of those credits (never below zero), once.
 */
create or replace function public.arcana_refund_payment(p_payment_ref text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.arcana_payments%rowtype;
  bal integer;
  clawback integer;
begin
  if not public.arcana_is_server() or p_payment_ref is null or length(p_payment_ref) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into p from public.arcana_payments
  where provider_payment_ref = p_payment_ref and kind = 'credits' for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p.status = 'refunded' then
    return jsonb_build_object('ok', true, 'clawback', 0);
  end if;
  if p.status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  perform pg_advisory_xact_lock(hashtext(p.user_key));
  select coalesce(sum(amount), 0) into bal
  from public.arcana_credit_transactions where user_key = p.user_key;
  clawback := least(p.credits, greatest(bal, 0));

  update public.arcana_payments set status = 'refunded', updated_at = now() where id = p.id;
  if clawback > 0 then
    insert into public.arcana_credit_transactions
      (user_key, amount, kind, idempotency_key, note, created_by)
    values (p.user_key, -clawback, 'refund', 'refund:' || p.id::text,
            left(coalesce(p_reason, 'refund'), 40) || ': ' || p.package_name, 'system:' || p.provider)
    on conflict (user_key, idempotency_key) do nothing;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values ('system:' || p.provider, 'payment_refunded', public.arcana_user_ref(p.user_key),
          jsonb_build_object('payment_id', p.id, 'reason', p_reason, 'credits', p.credits,
                             'clawback', clawback, 'livemode', p.livemode));
  return jsonb_build_object('ok', true, 'clawback', clawback);
end;
$$;

-- a manual tier set by an admin replaces a provider-managed one
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
    (user_key, tier, status, current_period_end, updated_at, updated_by, source)
  values (k, p_tier, 'active', p_period_end, now(), public.arcana_admin_actor(), 'admin')
  on conflict (user_key) do update
    set tier = excluded.tier, status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = now(), updated_by = excluded.updated_by, source = 'admin';
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'set_tier', public.arcana_user_ref(k),
          jsonb_build_object('tier', p_tier, 'period_end', p_period_end));
  return true;
end;
$$;

create or replace function public.arcana_admin_subscriptions(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
    from (
      select public.arcana_user_ref(s.user_key) as ref, u.email::text as email,
             s.tier, s.status, s.source, s.plan_id, s.current_period_end,
             s.cancel_at_period_end, s.updated_at,
             (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now())) as active
      from public.arcana_subscriptions s
      left join auth.users u on s.user_key = 'u:' || u.id::text
      where s.tier <> 'free'
      order by s.updated_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)) x);
end;
$$;

-- ── settings: allow the 'plans' and 'daily' keys ─────────────────────────
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
    'models', 'prompt_addendum', 'model_prices', 'packages', 'billing', 'plans', 'daily'
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

-- ── guest → account claim: also daily draws; a second guest trial is voided ──
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
  trial integer;
  guest_bal integer;
  had_trial boolean;
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

  update public.arcana_daily_draws d set user_key = account_key
  where d.user_key = hdr
    and not exists (select 1 from public.arcana_daily_draws x
                    where x.user_key = account_key and x.day = d.day);

  -- credits: keep every row; rename only keys that would collide (daily grants)
  perform pg_advisory_xact_lock(hashtext(account_key));
  had_trial := exists (
    select 1 from public.arcana_credit_transactions
    where user_key = account_key and idempotency_key like 'guest-trial%');
  select coalesce(sum(amount), 0) into guest_bal
  from public.arcana_credit_transactions where user_key = hdr;
  select coalesce(sum(amount), 0) into trial
  from public.arcana_credit_transactions where user_key = hdr and idempotency_key = 'guest-trial';

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

  -- one guest trial per account: the unspent part of a further trial is voided
  if had_trial and trial > 0 and guest_bal > 0 then
    insert into public.arcana_credit_transactions
      (user_key, amount, kind, idempotency_key, note, created_by)
    values (account_key, -least(trial, guest_bal), 'bonus',
            'guest-trial-void:' || md5(hdr), 'repeat guest trial voided', 'system')
    on conflict (user_key, idempotency_key) do nothing;
  end if;

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
grant execute on function public.arcana_daily_state() to anon, authenticated;
grant execute on function public.arcana_daily_draw(text, text, text) to anon, authenticated;
grant execute on function public.arcana_daily_message_get(text, text, text) to anon, authenticated;
grant execute on function public.arcana_daily_message_put(text, text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.arcana_create_subscription_payment(text, text, text, integer, integer, boolean, boolean) to anon, authenticated;
grant execute on function public.arcana_activate_subscription(uuid, text, text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.arcana_sync_subscription(text, text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.arcana_subscription_plan(text) to anon, authenticated;
grant execute on function public.arcana_renew_subscription(text, text, integer, text, integer, text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.arcana_my_subscription() to anon, authenticated;
grant execute on function public.arcana_my_billing_customer() to anon, authenticated;
grant execute on function public.arcana_refund_payment(text, text) to anon, authenticated;
grant execute on function public.arcana_admin_subscriptions(integer) to anon, authenticated;
revoke execute on function public.arcana_daily_streak(text, date) from public, anon, authenticated;
