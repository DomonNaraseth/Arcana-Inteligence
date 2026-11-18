-- ARCANA INTELLIGENCE — sharing the daily card
--
-- A shared daily card carries nothing personal: the link names the card, its
-- orientation and the day, and the message of the day is the one shared by
-- everyone who drew that card that day. Share clicks are counted as an event.

alter table public.arcana_events drop constraint if exists arcana_events_event_check;
alter table public.arcana_events
  add constraint arcana_events_event_check check (event in ('page_view', 'out_of_credits', 'share'));

/** The message of the day for a card on a given day (any knowledge-base version, newest first). */
create or replace function public.arcana_daily_message_for(p_day date, p_card_id text, p_orientation text)
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
    where day = p_day and card_id = p_card_id and orientation = p_orientation
    order by created_at desc limit 1);
end;
$$;

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
  if p_event not in ('page_view', 'out_of_credits', 'share') or v_path !~ '^(/[A-Za-z0-9\-\[\]/]*)?$' then
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
    sharers as (
      select distinct user_key from public.arcana_events where event = 'share' and day > since_day),
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
        jsonb_build_object('key', 'share', 'count', (select count(*) from sharers)),
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
      'shares', (
        select coalesce(jsonb_agg(x order by x.shares desc), '[]'::jsonb) from (
          select replace(path, '/share/', '') as channel, count(*) as shares, count(distinct user_key) as people
          from public.arcana_events where event = 'share' and day > since_day
          group by path) x),
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


grant execute on function public.arcana_daily_message_for(date, text, text) to anon, authenticated;
