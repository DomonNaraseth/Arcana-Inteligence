-- ARCANA INTELLIGENCE — automatic PromptPay QR through a payment gateway (Beam)
--
-- The customer scans a QR issued by the gateway for exactly one payment. When
-- the gateway reports the charge as paid (signed webhook, re-checked by our own
-- server-side lookup) arcana_fulfill_gateway() re-checks the reference, amount
-- and currency and grants through arcana_promptpay_grant() — the same single
-- place that grants every PromptPay purchase. A charge pays for one payment.
-- A payment may have several charges (an expired QR is replaced), so a QR that
-- is paid late is still matched to its payment.

create table if not exists public.arcana_gateway_charges (
  charge_id text primary key check (charge_id ~ '^[A-Za-z0-9_-]{4,80}$'),
  payment_id uuid not null references public.arcana_payments (id) on delete cascade,
  provider text not null default 'beam' check (provider in ('beam')),
  qr_image text not null check (length(qr_image) <= 200000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists arcana_gateway_charges_payment_idx
  on public.arcana_gateway_charges (payment_id, created_at desc);
alter table public.arcana_gateway_charges enable row level security;

/** Stores a fresh gateway QR for the caller's own pending PromptPay payment. */
create or replace function public.arcana_attach_gateway_charge(
  p_payment_id uuid, p_charge_id text, p_qr_image text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return false;
  end if;
  if not exists (
    select 1 from public.arcana_payments
    where id = p_payment_id and user_key = public.arcana_user_key()
      and provider = 'promptpay' and status = 'pending'
  ) then
    return false;
  end if;
  insert into public.arcana_gateway_charges (charge_id, payment_id, qr_image, expires_at)
  values (p_charge_id, p_payment_id, p_qr_image, p_expires_at);
  return true;
end;
$$;
grant execute on function public.arcana_attach_gateway_charge(uuid, text, text, timestamptz) to anon, authenticated;

/** The newest QR of the caller's own payment (null when there is none). */
create or replace function public.arcana_my_gateway_charge(p_payment_id uuid)
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
    select jsonb_build_object('charge_id', g.charge_id, 'qr_image', g.qr_image, 'expires_at', g.expires_at)
    from public.arcana_gateway_charges g
    join public.arcana_payments p on p.id = g.payment_id
    where g.payment_id = p_payment_id and p.user_key = public.arcana_user_key()
    order by g.created_at desc
    limit 1);
end;
$$;
grant execute on function public.arcana_my_gateway_charge(uuid) to anon, authenticated;

/** Every charge of the caller's own payment, newest first — the pay page checks them all. */
create or replace function public.arcana_my_gateway_charge_ids(p_payment_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.arcana_is_server() then
    return '{}';
  end if;
  return coalesce((
    select array_agg(g.charge_id order by g.created_at desc)
    from public.arcana_gateway_charges g
    join public.arcana_payments p on p.id = g.payment_id
    where g.payment_id = p_payment_id and p.user_key = public.arcana_user_key()), '{}');
end;
$$;
grant execute on function public.arcana_my_gateway_charge_ids(uuid) to anon, authenticated;

/**
 * Called by the server only after the gateway confirmed the charge (its signed
 * webhook followed by our own lookup, or our lookup alone). The caller need
 * not own the payment — a webhook has no user — so everything is re-checked
 * against the charge on record: reference, amount and currency.
 */
create or replace function public.arcana_fulfill_gateway(
  p_charge_id text, p_reference_id text, p_amount_minor integer, p_currency text, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.arcana_gateway_charges%rowtype;
  p public.arcana_payments%rowtype;
begin
  if not public.arcana_is_server() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into g from public.arcana_gateway_charges where charge_id = p_charge_id;
  if not found or g.provider is distinct from p_provider then
    return jsonb_build_object('ok', false, 'reason', 'unknown_charge');
  end if;
  select * into p from public.arcana_payments where id = g.payment_id and provider = 'promptpay';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_reference_id is distinct from p.id::text then
    return jsonb_build_object('ok', false, 'reason', 'reference_mismatch');
  end if;
  if p_amount_minor is distinct from p.amount_minor or upper(coalesce(p_currency, '')) <> upper(p.currency) then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;
  -- an expired order paid late is still honoured: the money did arrive
  if p.status = 'expired' then
    update public.arcana_payments set status = 'pending', updated_at = now() where id = p.id;
  end if;
  return public.arcana_promptpay_grant(p.id, p_provider || ':' || p_charge_id, 'system:' || p_provider)
         || jsonb_build_object('user_ref', public.arcana_user_ref(p.user_key));
end;
$$;
grant execute on function public.arcana_fulfill_gateway(text, text, integer, text, text) to anon, authenticated;
