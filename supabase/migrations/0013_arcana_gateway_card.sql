-- ARCANA INTELLIGENCE — card payments through the gateway's hosted checkout
--
-- A card checkout link is recorded in arcana_gateway_charges beside QR charges
-- (id "pl_<linkId>", no QR image) and confirmed by the same lookup and the same
-- arcana_fulfill_gateway() re-checks. The "current QR" of a payment must
-- therefore skip card links.

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
      and g.qr_image <> ''
    order by g.created_at desc
    limit 1);
end;
$$;
grant execute on function public.arcana_my_gateway_charge(uuid) to anon, authenticated;
