-- ARCANA INTELLIGENCE — admin-editable tarot knowledge
--
-- The canonical knowledge base (78 cards, spread catalog) ships in code.
-- Admins may override its *text* (meanings, names, position descriptions);
-- structure (ids, arcana, suit, element, card counts, position keys) is fixed.
-- An override row holds only the fields that differ; deleting the row restores
-- the shipped default. Every change is written to arcana_audit_logs with the
-- old and new value, so the history of the knowledge base is reconstructible.

create table if not exists public.arcana_kb_overrides (
  entity_type text not null check (entity_type in ('card', 'spread')),
  entity_id text not null check (entity_id ~ '^[a-z0-9_-]{1,64}$'),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (entity_type, entity_id)
);

alter table public.arcana_kb_overrides enable row level security;
revoke all on public.arcana_kb_overrides from anon, authenticated;

create or replace function public.arcana_kb_overrides()
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
  return jsonb_build_object(
    'cards', (
      select coalesce(jsonb_object_agg(entity_id, fields), '{}'::jsonb)
      from public.arcana_kb_overrides where entity_type = 'card'),
    'spreads', (
      select coalesce(jsonb_object_agg(entity_id, fields), '{}'::jsonb)
      from public.arcana_kb_overrides where entity_type = 'spread'));
end;
$$;

create or replace function public.arcana_admin_set_kb_override(
  p_type text, p_id text, p_fields jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_fields jsonb;
  rev integer;
begin
  perform public.arcana_require_admin();
  if p_type not in ('card', 'spread') then
    raise exception 'arcana: invalid knowledge type';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' or length(p_fields::text) > 20000 then
    raise exception 'arcana: invalid knowledge fields';
  end if;
  select fields into old_fields
  from public.arcana_kb_overrides where entity_type = p_type and entity_id = p_id;

  insert into public.arcana_kb_overrides (entity_type, entity_id, fields, updated_at, updated_by)
  values (p_type, p_id, p_fields, now(), public.arcana_admin_actor())
  on conflict (entity_type, entity_id) do update
    set fields = excluded.fields,
        revision = public.arcana_kb_overrides.revision + 1,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning revision into rev;

  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'set_kb_override', p_type || ':' || p_id,
          jsonb_build_object('old', old_fields, 'new', p_fields, 'revision', rev));
  return rev;
end;
$$;

create or replace function public.arcana_admin_reset_kb_override(p_type text, p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_fields jsonb;
begin
  perform public.arcana_require_admin();
  delete from public.arcana_kb_overrides
  where entity_type = p_type and entity_id = p_id
  returning fields into old_fields;
  if old_fields is null then
    return false;
  end if;
  insert into public.arcana_audit_logs (actor, action, target, detail)
  values (public.arcana_admin_actor(), 'reset_kb_override', p_type || ':' || p_id,
          jsonb_build_object('old', old_fields));
  return true;
end;
$$;

grant execute on function public.arcana_kb_overrides() to anon, authenticated;
grant execute on function public.arcana_admin_set_kb_override(text, text, jsonb) to anon, authenticated;
grant execute on function public.arcana_admin_reset_kb_override(text, text) to anon, authenticated;
