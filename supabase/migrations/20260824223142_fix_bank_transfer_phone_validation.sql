-- Keep formatted WhatsApp numbers valid when bank transfer is enabled.
create or replace function public.create_bank_transfer_attempt(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  settings_record record;
  attempt_record record;
  new_attempt_id uuid;
begin
  select id, status, total, stock_reserved, reservation_expires_at
  into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Pedido no encontrado'; end if;
  if order_record.status <> 'pending' or not order_record.stock_reserved then
    raise exception 'Este pedido no admite transferencia bancaria';
  end if;
  if order_record.reservation_expires_at is null or order_record.reservation_expires_at <= now() then
    raise exception 'La reserva de stock venció';
  end if;

  select enabled, account_alias, account_holder
  into settings_record
  from public.bank_transfer_settings
  where id = 1;

  if not coalesce(settings_record.enabled, false)
     or nullif(btrim(settings_record.account_alias), '') is null
     or nullif(btrim(settings_record.account_holder), '') is null
     or not exists (
       select 1 from public.store_settings
       where id = 1
         and char_length(regexp_replace(coalesce(whatsapp_phone, ''), '\D', '', 'g')) between 10 and 13
     ) then
    raise exception 'La transferencia bancaria no está disponible';
  end if;

  select id, provider, status into attempt_record
  from public.order_payment_attempts
  where order_id = p_order_id
    and status in ('created', 'pending', 'in_process', 'review')
  for update;

  if found then
    if attempt_record.provider = 'bank_transfer' and attempt_record.status = 'pending' then
      return attempt_record.id;
    end if;
    raise exception 'Ya existe un intento de pago activo para este pedido';
  end if;

  insert into public.order_payment_attempts (
    order_id, provider, status, amount, currency, updated_at
  ) values (
    p_order_id, 'bank_transfer', 'pending', order_record.total, 'ARS', now()
  ) returning id into new_attempt_id;

  update public.orders
  set reservation_expires_at = now() + interval '2 hours'
  where id = p_order_id;

  return new_attempt_id;
end;
$$;

revoke all on function public.create_bank_transfer_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.create_bank_transfer_attempt(uuid)
  to service_role;
