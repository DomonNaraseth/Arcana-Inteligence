-- ARCANA INTELLIGENCE — Oracle deck studio + housekeeping
--
-- 1. arcana_expire_stale_payments(): the daily cron closes PromptPay orders
--    that were never paid nor reported (no claim) after 48 hours. It grants
--    nothing and touches no other status.
-- 2. Oracle decks: admins design a deck with AI (concept, card texts, art) in
--    Admin → Oracle. Every write goes through an arcana_admin_oracle_* function
--    that calls arcana_require_admin() and writes arcana_audit_logs (rule 8).
--    Anyone may read a published deck; drafts are admin-only. Card art is kept
--    as compact WebP in arcana_oracle_images (one row per current picture; the
--    old picture is deleted when a card is repainted).

-- ── 1. housekeeping ──────────────────────────────────────────────────────
create or replace function public.arcana_expire_stale_payments(p_hours integer default 48)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.arcana_is_server() then
    raise exception 'arcana: server only' using errcode = '42501';
  end if;
  update public.arcana_payments
     set status = 'expired', updated_at = now()
   where provider = 'promptpay'
     and status = 'pending'
     and claim is null
     and created_at < now() - make_interval(hours => greatest(coalesce(p_hours, 48), 24));
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.arcana_audit_logs (actor, action, target, detail)
    values ('system:cron', 'expire_stale_payments', 'promptpay', jsonb_build_object('count', n, 'hours', p_hours));
  end if;
  return n;
end;
$$;
grant execute on function public.arcana_expire_stale_payments(integer) to anon, authenticated;

-- ── 2. oracle tables ─────────────────────────────────────────────────────
create table if not exists public.arcana_oracle_decks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  title text not null check (char_length(title) between 1 and 120),
  title_en text not null default '' check (char_length(title_en) <= 120),
  tagline text not null default '' check (char_length(tagline) <= 300),
  brief jsonb not null default '{}'::jsonb,
  concept jsonb not null default '{}'::jsonb,
  card_count integer not null check (card_count between 4 and 78),
  status text not null default 'draft' check (status in ('draft', 'published')),
  cover_image uuid,
  back_image uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.arcana_oracle_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.arcana_oracle_decks (id) on delete cascade,
  number integer not null check (number between 1 and 78),
  name text not null check (char_length(name) between 1 and 80),
  name_en text not null default '' check (char_length(name_en) <= 80),
  essence text not null default '' check (char_length(essence) <= 300),
  keywords text[] not null default '{}',
  meaning text not null default '' check (char_length(meaning) <= 2000),
  message text not null default '' check (char_length(message) <= 1200),
  affirmation text not null default '' check (char_length(affirmation) <= 300),
  reflection text not null default '' check (char_length(reflection) <= 300),
  visual text not null default '' check (char_length(visual) <= 1200),
  image uuid,
  image_status text not null default 'none' check (image_status in ('none', 'ready', 'failed')),
  image_error text,
  updated_at timestamptz not null default now(),
  unique (deck_id, number)
);

create table if not exists public.arcana_oracle_images (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.arcana_oracle_decks (id) on delete cascade,
  mime text not null check (mime in ('image/webp', 'image/png', 'image/jpeg')),
  bytes bytea not null check (octet_length(bytes) <= 3145728),
  model text,
  prompt text,
  created_at timestamptz not null default now()
);
create index if not exists arcana_oracle_images_deck_idx on public.arcana_oracle_images (deck_id);

alter table public.arcana_oracle_decks enable row level security;
alter table public.arcana_oracle_cards enable row level security;
alter table public.arcana_oracle_images enable row level security;
-- no policies: every read and write goes through the functions below

-- ── 3. reading ───────────────────────────────────────────────────────────
create or replace function public.arcana_oracle_deck_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'slug', d.slug, 'title', d.title, 'title_en', d.title_en, 'tagline', d.tagline,
    'brief', d.brief, 'concept', d.concept, 'card_count', d.card_count, 'status', d.status,
    'cover_image', d.cover_image, 'back_image', d.back_image,
    'created_at', d.created_at, 'updated_at', d.updated_at, 'published_at', d.published_at,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', c.number, 'name', c.name, 'name_en', c.name_en, 'essence', c.essence,
        'keywords', to_jsonb(c.keywords), 'meaning', c.meaning, 'message', c.message,
        'affirmation', c.affirmation, 'reflection', c.reflection, 'visual', c.visual,
        'image', c.image, 'image_status', c.image_status, 'image_error', c.image_error)
        order by c.number)
      from public.arcana_oracle_cards c where c.deck_id = d.id), '[]'::jsonb))
  from public.arcana_oracle_decks d where d.id = p_id
$$;
revoke all on function public.arcana_oracle_deck_json(uuid) from public, anon, authenticated;

/** A published deck by slug for everyone; any deck for admins. */
create or replace function public.arcana_oracle_public_deck(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.arcana_oracle_decks;
begin
  select * into d from public.arcana_oracle_decks where slug = p_slug;
  if d.id is null or (d.status <> 'published' and not public.arcana_is_admin()) then
    return null;
  end if;
  return public.arcana_oracle_deck_json(d.id) - 'brief';
end;
$$;
grant execute on function public.arcana_oracle_public_deck(text) to anon, authenticated;

create or replace function public.arcana_oracle_published()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', d.slug, 'title', d.title, 'title_en', d.title_en, 'tagline', d.tagline,
    'card_count', d.card_count, 'cover_image', d.cover_image, 'published_at', d.published_at)
    order by d.published_at desc), '[]'::jsonb)
  from public.arcana_oracle_decks d where d.status = 'published'
$$;
grant execute on function public.arcana_oracle_published() to anon, authenticated;

/** Image bytes (base64) of a published deck for everyone; any deck's for admins. */
create or replace function public.arcana_oracle_image(p_id uuid)
returns table (mime text, data text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.mime, encode(i.bytes, 'base64')
  from public.arcana_oracle_images i
  join public.arcana_oracle_decks d on d.id = i.deck_id
  where i.id = p_id and (d.status = 'published' or public.arcana_is_admin())
$$;
grant execute on function public.arcana_oracle_image(uuid) to anon, authenticated;

-- ── 4. admin ─────────────────────────────────────────────────────────────
create or replace function public.arcana_admin_oracle_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'slug', d.slug, 'title', d.title, 'title_en', d.title_en, 'tagline', d.tagline,
      'card_count', d.card_count, 'status', d.status, 'cover_image', d.cover_image,
      'updated_at', d.updated_at, 'published_at', d.published_at,
      'cards_written', (select count(*) from public.arcana_oracle_cards c where c.deck_id = d.id and c.message <> ''),
      'cards_painted', (select count(*) from public.arcana_oracle_cards c where c.deck_id = d.id and c.image_status = 'ready'))
      order by d.updated_at desc), '[]'::jsonb)
    from public.arcana_oracle_decks d);
end;
$$;
grant execute on function public.arcana_admin_oracle_list() to authenticated, anon;

create or replace function public.arcana_admin_oracle_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  return public.arcana_oracle_deck_json(p_id);
end;
$$;
grant execute on function public.arcana_admin_oracle_get(uuid) to authenticated, anon;

create or replace function public.arcana_admin_oracle_create(
  p_title text, p_slug text, p_card_count integer, p_brief jsonb, p_concept jsonb, p_title_en text, p_tagline text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  s text := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9-]+', '-', 'g'));
begin
  perform public.arcana_require_admin();
  s := trim(both '-' from s);
  if s = '' or length(s) < 2 then
    s := 'deck-' || substr(md5(random()::text), 1, 8);
  end if;
  -- keep slugs unique without asking the admin to invent one
  while exists (select 1 from public.arcana_oracle_decks where slug = s) loop
    s := left(s, 52) || '-' || substr(md5(random()::text), 1, 6);
  end loop;
  insert into public.arcana_oracle_decks (slug, title, title_en, tagline, brief, concept, card_count, created_by)
  values (s, p_title, coalesce(p_title_en, ''), coalesce(p_tagline, ''), coalesce(p_brief, '{}'::jsonb),
          coalesce(p_concept, '{}'::jsonb), p_card_count, public.arcana_admin_actor())
  returning id into new_id;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'oracle_create', 'oracle:' || new_id, jsonb_build_object('title', p_title, 'cards', p_card_count));
  return new_id;
end;
$$;
grant execute on function public.arcana_admin_oracle_create(text, text, integer, jsonb, jsonb, text, text) to authenticated, anon;

/** Updates text fields of a deck; only keys present in p_patch change. */
create or replace function public.arcana_admin_oracle_update(p_id uuid, p_patch jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  update public.arcana_oracle_decks set
    title = coalesce(p_patch ->> 'title', title),
    title_en = coalesce(p_patch ->> 'title_en', title_en),
    tagline = coalesce(p_patch ->> 'tagline', tagline),
    concept = coalesce(p_patch -> 'concept', concept),
    brief = coalesce(p_patch -> 'brief', brief),
    updated_at = now()
  where id = p_id;
  if not found then
    return false;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'oracle_update', 'oracle:' || p_id,
          jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return true;
end;
$$;
grant execute on function public.arcana_admin_oracle_update(uuid, jsonb) to authenticated, anon;

/** Inserts or updates cards by number (text only; art is set separately). */
create or replace function public.arcana_admin_oracle_save_cards(p_id uuid, p_cards jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
  n integer := 0;
  total integer;
begin
  perform public.arcana_require_admin();
  select card_count into total from public.arcana_oracle_decks where id = p_id;
  if total is null then
    raise exception 'arcana: invalid deck';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) loop
    if (c ->> 'number')::integer not between 1 and total then
      raise exception 'arcana: invalid card number';
    end if;
    insert into public.arcana_oracle_cards
      (deck_id, number, name, name_en, essence, keywords, meaning, message, affirmation, reflection, visual)
    values (
      p_id, (c ->> 'number')::integer, c ->> 'name', coalesce(c ->> 'name_en', ''), coalesce(c ->> 'essence', ''),
      coalesce((select array_agg(left(k, 40)) from jsonb_array_elements_text(c -> 'keywords') k), '{}'),
      coalesce(c ->> 'meaning', ''), coalesce(c ->> 'message', ''), coalesce(c ->> 'affirmation', ''),
      coalesce(c ->> 'reflection', ''), coalesce(c ->> 'visual', ''))
    on conflict (deck_id, number) do update set
      name = excluded.name,
      name_en = case when c ? 'name_en' then excluded.name_en else public.arcana_oracle_cards.name_en end,
      essence = case when c ? 'essence' then excluded.essence else public.arcana_oracle_cards.essence end,
      keywords = case when c ? 'keywords' then excluded.keywords else public.arcana_oracle_cards.keywords end,
      meaning = case when c ? 'meaning' then excluded.meaning else public.arcana_oracle_cards.meaning end,
      message = case when c ? 'message' then excluded.message else public.arcana_oracle_cards.message end,
      affirmation = case when c ? 'affirmation' then excluded.affirmation else public.arcana_oracle_cards.affirmation end,
      reflection = case when c ? 'reflection' then excluded.reflection else public.arcana_oracle_cards.reflection end,
      visual = case when c ? 'visual' then excluded.visual else public.arcana_oracle_cards.visual end,
      updated_at = now();
    n := n + 1;
  end loop;
  update public.arcana_oracle_decks set updated_at = now() where id = p_id;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'oracle_save_cards', 'oracle:' || p_id, jsonb_build_object('cards', n));
  return n;
end;
$$;
grant execute on function public.arcana_admin_oracle_save_cards(uuid, jsonb) to authenticated, anon;

/** Stores new art for a card (p_target 'card'), the cover or the card back; deletes the picture it replaces. */
create or replace function public.arcana_admin_oracle_set_image(
  p_id uuid, p_target text, p_number integer, p_mime text, p_b64 text, p_model text, p_prompt text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  img uuid;
  old uuid;
begin
  perform public.arcana_require_admin();
  if p_target not in ('card', 'cover', 'back') then
    raise exception 'arcana: invalid target';
  end if;
  if not exists (select 1 from public.arcana_oracle_decks where id = p_id) then
    raise exception 'arcana: invalid deck';
  end if;
  insert into public.arcana_oracle_images (deck_id, mime, bytes, model, prompt)
  values (p_id, p_mime, decode(p_b64, 'base64'), left(p_model, 80), left(p_prompt, 4000))
  returning id into img;

  if p_target = 'card' then
    select image into old from public.arcana_oracle_cards where deck_id = p_id and number = p_number;
    update public.arcana_oracle_cards
       set image = img, image_status = 'ready', image_error = null, updated_at = now()
     where deck_id = p_id and number = p_number;
    if not found then
      raise exception 'arcana: invalid card number';
    end if;
  elsif p_target = 'cover' then
    select cover_image into old from public.arcana_oracle_decks where id = p_id;
    update public.arcana_oracle_decks set cover_image = img, updated_at = now() where id = p_id;
  else
    select back_image into old from public.arcana_oracle_decks where id = p_id;
    update public.arcana_oracle_decks set back_image = img, updated_at = now() where id = p_id;
  end if;
  if old is not null then
    delete from public.arcana_oracle_images where id = old;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'oracle_set_image', 'oracle:' || p_id,
          jsonb_build_object('target', p_target, 'number', p_number, 'model', p_model,
                             'bytes', octet_length(decode(p_b64, 'base64'))));
  return img;
end;
$$;
grant execute on function public.arcana_admin_oracle_set_image(uuid, text, integer, text, text, text, text) to authenticated, anon;

create or replace function public.arcana_admin_oracle_image_failed(p_id uuid, p_number integer, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  update public.arcana_oracle_cards
     set image_status = case when image is null then 'failed' else image_status end,
         image_error = left(p_error, 300), updated_at = now()
   where deck_id = p_id and number = p_number;
  return found;
end;
$$;
grant execute on function public.arcana_admin_oracle_image_failed(uuid, integer, text) to authenticated, anon;

create or replace function public.arcana_admin_oracle_publish(p_id uuid, p_publish boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.arcana_require_admin();
  update public.arcana_oracle_decks
     set status = case when p_publish then 'published' else 'draft' end,
         published_at = case when p_publish then coalesce(published_at, now()) else published_at end,
         updated_at = now()
   where id = p_id;
  if not found then
    return false;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), case when p_publish then 'oracle_publish' else 'oracle_unpublish' end,
          'oracle:' || p_id, null);
  return true;
end;
$$;
grant execute on function public.arcana_admin_oracle_publish(uuid, boolean) to authenticated, anon;

create or replace function public.arcana_admin_oracle_delete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
begin
  perform public.arcana_require_admin();
  delete from public.arcana_oracle_decks where id = p_id returning title into t;
  if t is null then
    return false;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'oracle_delete', 'oracle:' || p_id, jsonb_build_object('title', t));
  return true;
end;
$$;
grant execute on function public.arcana_admin_oracle_delete(uuid) to authenticated, anon;
