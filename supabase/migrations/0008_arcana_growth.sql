-- ARCANA INTELLIGENCE — first-party growth measurement
--
-- No third-party pixels and no personal data: a visit is recorded against the
-- same pseudonymous key the app already uses (guest token or account), at most
-- once per path per day. Where a visitor came from is kept as two touchpoints
-- (first and last), reduced to source / medium / campaign, the referring host
-- and a device class — never a full URL, IP address or user agent. Everything
-- else in the funnel (daily cards, sign-ups, readings, payments) is read from
-- the tables that already record it.

create table if not exists public.arcana_events (
  id bigint generated always as identity primary key,
  user_key text not null,
  event text not null check (event in ('page_view', 'out_of_credits')),
  path text not null default '',
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_key, event, path, day)
);
create index if not exists arcana_events_day_idx on public.arcana_events (day, event);

create table if not exists public.arcana_touchpoints (
  user_key text not null,
  touch text not null check (touch in ('first', 'last')),
  source text not null,
  medium text,
  campaign text,
  content text,
  term text,
  referrer_host text,
  landing_path text,
  device text check (device in ('mobile', 'tablet', 'desktop')),
  created_at timestamptz not null default now(),
  primary key (user_key, touch)
);

alter table public.arcana_events enable row level security;
alter table public.arcana_touchpoints enable row level security;
revoke all on public.arcana_events from anon, authenticated;
revoke all on public.arcana_touchpoints from anon, authenticated;

/**
 * Records one event for the caller. p_touch is present only when the visit
 * carries campaign tags or an outside referrer; a caller's very first visit
 * is recorded as a first touch either way ('direct' when nothing is known).
 * Admin sessions are not measured.
 */
create or replace function public.arcana_track(p_event text, p_path text, p_touch jsonb, p_device text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := public.arcana_user_key();
  today date := (now() at time zone 'Asia/Bangkok')::date;
  v_path text := left(coalesce(p_path, ''), 120);
  v_device text := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else null end;
  n integer;
begin
  if not public.arcana_is_server() or k is null then
    return false;
  end if;
  if p_event not in ('page_view', 'out_of_credits') or v_path !~ '^(/[A-Za-z0-9\-\[\]/]*)?$' then
    return false;
  end if;
  if public.arcana_admin_role() is not null then
    return false;
  end if;

  insert into public.arcana_events (user_key, event, path, day)
  values (k, p_event, v_path, today)
  on conflict (user_key, event, path, day) do nothing;
  get diagnostics n = row_count;

  if p_event = 'page_view' then
    if p_touch is not null and jsonb_typeof(p_touch) = 'object' and coalesce(p_touch ->> 'source', '') <> '' then
      insert into public.arcana_touchpoints
        (user_key, touch, source, medium, campaign, content, term, referrer_host, landing_path, device)
      select k, t.touch, left(p_touch ->> 'source', 60), left(p_touch ->> 'medium', 60),
             left(p_touch ->> 'campaign', 100), left(p_touch ->> 'content', 100), left(p_touch ->> 'term', 100),
             left(p_touch ->> 'referrer_host', 120), v_path, v_device
      from (values ('first'), ('last')) as t(touch)
      on conflict (user_key, touch) do update
        set source = excluded.source, medium = excluded.medium, campaign = excluded.campaign,
            content = excluded.content, term = excluded.term, referrer_host = excluded.referrer_host,
            landing_path = excluded.landing_path, device = excluded.device, created_at = now()
        where public.arcana_touchpoints.touch = 'last';
    else
      insert into public.arcana_touchpoints (user_key, touch, source, landing_path, device)
      values (k, 'first', 'direct', v_path, v_device)
      on conflict (user_key, touch) do nothing;
    end if;
  end if;
  return n > 0;
end;
$$;

-- ── admin read model ─────────────────────────────────────────────────────
create or replace function public.arcana_admin_funnel(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
  since_day date := ((now() at time zone 'Asia/Bangkok') - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365)))::date;
begin
  perform public.arcana_require_admin();
  return (
    with
    visitors as (
      select distinct user_key from public.arcana_events where event = 'page_view' and day > since_day),
    daily as (
      select distinct user_key from public.arcana_daily_draws where day > since_day),
    -- accounts created in the period that have used ARCANA (the auth project is shared)
    signups as (
      select distinct 'u:' || u.id::text as user_key
      from auth.users u
      where u.created_at >= since
        and (exists (select 1 from public.arcana_events e where e.user_key = 'u:' || u.id::text)
          or exists (select 1 from public.arcana_readings r where r.user_key = 'u:' || u.id::text)
          or exists (select 1 from public.arcana_credit_transactions c where c.user_key = 'u:' || u.id::text))),
    readers as (
      select distinct user_key from public.arcana_readings where created_at >= since),
    interpreted as (
      select distinct r.user_key
      from public.arcana_reading_analyses a join public.arcana_readings r on r.id = a.reading_id
      where a.created_at >= since),
    out_of_credits as (
      select distinct user_key from public.arcana_events where event = 'out_of_credits' and day > since_day),
    pricing as (
      select distinct user_key from public.arcana_events where event = 'page_view' and path = '/pricing' and day > since_day),
    checkout as (
      select distinct user_key from public.arcana_payments where created_at >= since and livemode),
    payers as (
      select distinct user_key from public.arcana_payments where status = 'paid' and livemode and paid_at >= since),
    revenue as (
      select user_key, sum(amount_minor) as minor
      from public.arcana_payments where status = 'paid' and livemode and paid_at >= since group by user_key),
    everyone as (
      select user_key from visitors union select user_key from daily union select user_key from readers
      union select user_key from signups union select user_key from checkout),
    sourced as (
      select e.user_key, coalesce(t.source, 'unknown') as source, coalesce(t.medium, '') as medium
      from everyone e left join public.arcana_touchpoints t on t.user_key = e.user_key and t.touch = 'first')
    select jsonb_build_object(
      'days', days,
      'steps', jsonb_build_array(
        jsonb_build_object('key', 'visitors', 'count', (select count(*) from visitors)),
        jsonb_build_object('key', 'daily', 'count', (select count(*) from daily)),
        jsonb_build_object('key', 'signups', 'count', (select count(*) from signups)),
        jsonb_build_object('key', 'readers', 'count', (select count(*) from readers)),
        jsonb_build_object('key', 'interpreted', 'count', (select count(*) from interpreted)),
        jsonb_build_object('key', 'out_of_credits', 'count', (select count(*) from out_of_credits)),
        jsonb_build_object('key', 'pricing', 'count', (select count(*) from pricing)),
        jsonb_build_object('key', 'checkout', 'count', (select count(*) from checkout)),
        jsonb_build_object('key', 'payers', 'count', (select count(*) from payers))),
      'revenue_minor', (select coalesce(sum(minor), 0) from revenue),
      'sources', (
        select coalesce(jsonb_agg(x order by x.users desc), '[]'::jsonb) from (
          select s.source, max(s.medium) as medium, count(*) as users,
                 count(*) filter (where s.user_key in (select user_key from signups)) as signups,
                 count(*) filter (where s.user_key in (select user_key from readers)) as readers,
                 count(*) filter (where s.user_key in (select user_key from payers)) as payers,
                 coalesce(sum(r.minor), 0) as revenue_minor
          from sourced s left join revenue r on r.user_key = s.user_key
          group by s.source) x),
      'top_pages', (
        select coalesce(jsonb_agg(x order by x.visitors desc), '[]'::jsonb) from (
          select path, count(distinct user_key) as visitors
          from public.arcana_events where event = 'page_view' and day > since_day
          group by path order by 2 desc limit 15) x),
      'quality', jsonb_build_object(
        'people', (select count(*) from everyone),
        'without_source', (select count(*) from sourced where source = 'unknown'),
        'direct', (select count(*) from sourced where source = 'direct'))
    ));
end;
$$;

-- ── guest → account claim: also measurement rows ─────────────────────────
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

  -- measurement: keep the account's own history; the guest's fills the gaps
  update public.arcana_events e set user_key = account_key
  where e.user_key = hdr
    and not exists (select 1 from public.arcana_events x
                    where x.user_key = account_key and x.event = e.event and x.path = e.path and x.day = e.day);
  delete from public.arcana_events where user_key = hdr;
  update public.arcana_touchpoints t set user_key = account_key
  where t.user_key = hdr
    and not exists (select 1 from public.arcana_touchpoints x where x.user_key = account_key and x.touch = t.touch);
  delete from public.arcana_touchpoints where user_key = hdr;

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

grant execute on function public.arcana_track(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.arcana_admin_funnel(integer) to anon, authenticated;
