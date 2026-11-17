-- ARCANA INTELLIGENCE — saved (bookmarked) readings
--
-- Every reading is already kept in the owner's history. saved_at marks the
-- ones the user explicitly chose to keep at hand. It is not a core field, so
-- the immutability guard on arcana_readings does not restrict it, and the
-- existing owner policy already limits who may set it.

alter table public.arcana_readings
  add column if not exists saved_at timestamptz;

create index if not exists arcana_readings_user_saved_idx
  on public.arcana_readings (user_key, saved_at desc)
  where saved_at is not null;
