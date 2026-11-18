-- ARCANA INTELLIGENCE — PromptPay transfers and prepaid memberships
--
-- The customer transfers to the owner's PromptPay account and uploads the slip.
-- A payment becomes 'paid' in exactly two ways, both audited:
--   1. arcana_fulfill_promptpay()       — after the slip-verification service
--                                          confirmed the transfer (server side)
--   2. arcana_admin_approve_promptpay() — an admin checked the bank statement
-- A transfer reference can pay for one payment only. A membership bought this
-- way is prepaid for 30 days and never renews by itself.

alter table public.arcana_payments drop constraint if exists arcana_payments_provider_check;
alter table public.arcana_payments
  add constraint arcana_payments_provider_check check (provider in ('stripe', 'promptpay'));
alter table public.arcana_payments add column if not exists claim jsonb;
create unique index if not exists arcana_payments_promptpay_ref_idx
  on public.arcana_payments (provider_payment_ref)
  where provider = 'promptpay' and provider_payment_ref is not null;

alter table public.arcana_subscriptions drop constraint if exists arcana_subscriptions_source_check;
alter table public.arcana_subscriptions
  add constraint arcana_subscriptions_source_check check (source in ('admin', 'stripe', 'prepaid'));

-- ── customer side ────────────────────────────────────────────────────────
create or replace function public.arcana_create_promptpay_payment(
  p_kind text, p_package_id text, p_package_name text, p_credits integer,
  p_amount_minor integer, p_plan_id text, p_livemode boolean,
  p_require_account boolean)
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
  if p_kind not in ('credits', 'subscription')
     or (p_kind = 'subscription' and coalesce(p_plan_id, '') not in ('basic', 'premium'))
     or p_credits is null or p_credits < 1 or p_credits > 100000
     or p_amount_minor is null or p_amount_minor < 100 or p_amount_minor > 100000000 then
    raise exception 'arcana: invalid payment';
  end if;
  select count(*) into recent
  from public.arcana_payments
  where user_key = k and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'arcana: too many payment attempts';
  end if;
  insert into public.arcana_payments
    (user_key, provider, package_id, package_name, credits, amount_minor, currency, livemode, kind, plan_id)
  values (k, 'promptpay', left(p_package_id, 40), left(p_package_name, 80), p_credits, p_amount_minor,
          'thb', coalesce(p_livemode, false), p_kind,
          case when p_kind = 'subscription' then p_plan_id else null end)
  returning id into new_id;
  return new_id;
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
      'currency', currency, 'package_name', package_name, 'provider', provider, 'kind', kind,
      'claimed', claim is not null,
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
      select id, status, credits, amount_minor, currency, package_name, provider, created_at, paid_at
      from public.arcana_payments
      where user_key = public.arcana_user_key()
      order by created_at desc
      limit least(greatest(coalesce(p_limit, 10), 1), 50)) p);
end;
$$;

/** "I have transferred" — a note for the admin; it grants nothing. */
create or replace function public.arcana_claim_promptpay(p_id uuid, p_note text)
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
  set claim = jsonb_build_object('at', now(), 'note', left(coalesce(p_note, ''), 200)),
      updated_at = now()
  where id = p_id and user_key = public.arcana_user_key()
    and provider = 'promptpay' and status = 'pending';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ── the one place that turns a PromptPay payment into credits ────────────
create or replace function public.arcana_promptpay_grant(p_id uuid, p_ref text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.arcana_payments%rowtype;
  s public.arcana_subscriptions%rowtype;
  n integer;
  until_ts timestamptz;
begin
  select * into p from public.arcana_payments where id = p_id for update;
  if not found or p.provider <> 'promptpay' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p.status = 'paid' then
    return jsonb_build_object('ok', true, 'credited', 0, 'status', 'paid');
  end if;
  if p.status = 'refunded' then
    return jsonb_build_object('ok', false, 'reason', 'refunded');
  end if;

  begin
    update public.arcana_payments
    set status = 'paid', paid_at = now(), provider_payment_ref = left(p_ref, 120), updated_at = now()
    where id = p.id;
  exception when unique_violation then
    -- this transfer already paid for another payment
    return jsonb_build_object('ok', false, 'reason', 'slip_used');
  end;

  insert into public.arcana_credit_transactions
    (user_key, amount, kind, idempotency_key, note, created_by)
  values (p.user_key, p.credits,
          case when p.kind = 'subscription' then 'subscription' else 'purchase' end,
          'payment:' || p.id::text, p.package_name, left(p_actor, 60))
  on conflict (user_key, idempotency_key) do nothing;
  get diagnostics n = row_count;

  if p.kind = 'subscription' and p.plan_id is not null then
    perform pg_advisory_xact_lock(hashtext(p.user_key));
    select * into s from public.arcana_subscriptions where user_key = p.user_key;
    -- renewing the same plan early adds to the time left; anything else starts today
    if found and s.status = 'active' and s.tier = p.plan_id
       and s.current_period_end is not null and s.current_period_end > now() then
      until_ts := s.current_period_end + interval '30 days';
    else
      until_ts := now() + interval '30 days';
    end if;
    insert into public.arcana_subscriptions
      (user_key, tier, status, current_period_end, updated_at, updated_by, provider,
       provider_customer_id, provider_subscription_id, plan_id, cancel_at_period_end, source)
    values (p.user_key, p.plan_id, 'active', until_ts, now(), left(p_actor, 60), 'promptpay',
            null, null, p.plan_id, false, 'prepaid')
    on conflict (user_key) do update
      set tier = excluded.tier, status = 'active', current_period_end = excluded.current_period_end,
          updated_at = now(), updated_by = excluded.updated_by, provider = 'promptpay',
          provider_customer_id = null, provider_subscription_id = null,
          plan_id = excluded.plan_id, cancel_at_period_end = false, source = 'prepaid';
  end if;

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (left(p_actor, 60), 'payment_paid', public.arcana_user_ref(p.user_key),
          jsonb_build_object('payment_id', p.id, 'package', p.package_name, 'credits', p.credits,
                             'amount_minor', p.amount_minor, 'currency', p.currency,
                             'livemode', p.livemode, 'kind', p.kind, 'provider', 'promptpay',
                             'ref', left(p_ref, 120), 'member_until', until_ts));
  return jsonb_build_object('ok', true, 'credited', case when n > 0 then p.credits else 0 end,
                            'status', 'paid', 'kind', p.kind, 'member_until', until_ts);
end;
$$;
revoke execute on function public.arcana_promptpay_grant(uuid, text, text) from public, anon, authenticated;

/**
 * Called by the server after the slip-verification service confirmed a
 * transfer. Re-checks owner, amount and time here, so a slip for a different
 * amount, an older transfer or someone else's payment cannot be used.
 */
create or replace function public.arcana_fulfill_promptpay(
  p_id uuid, p_trans_ref text, p_amount_minor integer, p_transferred_at timestamptz, p_verifier text)
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
  select * into p from public.arcana_payments
  where id = p_id and user_key = public.arcana_user_key() and provider = 'promptpay';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p.status = 'paid' then
    return jsonb_build_object('ok', true, 'credited', 0, 'status', 'paid');
  end if;
  if p_trans_ref is null or length(p_trans_ref) < 6 or p_transferred_at is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_slip');
  end if;
  if p_amount_minor is distinct from p.amount_minor then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;
  if p_transferred_at < p.created_at - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'slip_too_old');
  end if;
  return public.arcana_promptpay_grant(p.id, p_trans_ref, 'system:' || left(coalesce(p_verifier, 'slip'), 30));
end;
$$;

-- ── admin review ─────────────────────────────────────────────────────────
create or replace function public.arcana_admin_approve_promptpay(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  return public.arcana_promptpay_grant(p_id, 'manual:' || p_id::text, public.arcana_admin_actor());
end;
$$;

create or replace function public.arcana_admin_reject_promptpay(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  ref text;
begin
  perform public.arcana_require_admin();
  update public.arcana_payments
  set status = 'failed', updated_at = now()
  where id = p_id and provider = 'promptpay' and status = 'pending'
  returning public.arcana_user_ref(user_key) into ref;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.arcana_audit_logs (actor, action, target, detail)
    values (public.arcana_admin_actor(), 'payment_rejected', ref, jsonb_build_object('payment_id', p_id));
  end if;
  return n > 0;
end;
$$;

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
             p.provider, p.provider_payment_ref, p.kind, p.claim, p.created_at, p.paid_at
      from public.arcana_payments p
      left join auth.users u on p.user_key = 'u:' || u.id::text
      order by (p.provider = 'promptpay' and p.status = 'pending' and p.claim is not null) desc,
               p.created_at desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500)) x);
end;
$$;

-- ── settings: allow the 'promptpay' and 'business' keys ──────────────────
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
    'models', 'prompt_addendum', 'model_prices', 'packages', 'billing', 'plans', 'daily',
    'promptpay', 'business'
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

grant execute on function public.arcana_create_promptpay_payment(text, text, text, integer, integer, text, boolean, boolean) to anon, authenticated;
grant execute on function public.arcana_claim_promptpay(uuid, text) to anon, authenticated;
grant execute on function public.arcana_fulfill_promptpay(uuid, text, integer, timestamptz, text) to anon, authenticated;
grant execute on function public.arcana_admin_approve_promptpay(uuid) to anon, authenticated;
grant execute on function public.arcana_admin_reject_promptpay(uuid) to anon, authenticated;
