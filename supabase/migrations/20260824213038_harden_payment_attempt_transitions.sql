create or replace function public.apply_order_payment_attempt(
  p_order_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_external_id text,
  p_payment_status text,
  p_payment_status_detail text default null,
  p_receiver_account_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  first_event record;
  next_status text;
  normalized_status text;
  analytics_event_name text;
  item_count smallint;
begin
  if p_provider not in ('mercadopago', 'viumi') then
    raise exception 'Proveedor de pago inválido';
  end if;

  if p_payment_status not in (
    'pending', 'in_process', 'approved', 'rejected', 'cancelled',
    'failed', 'review', 'refunded', 'charged_back'
  ) then
    raise exception 'Estado de pago inválido';
  end if;

  select * into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  select * into attempt_record
  from public.order_payment_attempts
  where id = p_attempt_id
    and order_id = p_order_id
    and provider = p_provider
  for update;

  if not found then
    raise exception 'Intento de pago no encontrado';
  end if;

  normalized_status := p_payment_status;
  next_status := order_record.status;

  if attempt_record.status in ('refunded', 'charged_back') then
    return order_record.status;
  end if;

  if attempt_record.status in ('approved', 'review')
     and normalized_status not in ('refunded', 'charged_back') then
    return order_record.status;
  end if;

  if attempt_record.status in ('rejected', 'cancelled', 'failed') then
    return order_record.status;
  end if;

  if normalized_status = 'approved' then
    if order_record.status in ('pending', 'payment_review') and order_record.stock_reserved then
      next_status := 'paid';
    elsif order_record.status not in ('paid', 'ready_for_pickup', 'shipped', 'delivered') then
      next_status := 'payment_review';
      normalized_status := 'review';
    end if;
  elsif normalized_status = 'review' then
    if order_record.status in ('pending', 'payment_review') then
      next_status := 'payment_review';
    end if;
  elsif normalized_status in ('pending', 'in_process') then
    if order_record.status = 'pending' then
      update public.orders
      set reservation_expires_at = greatest(
        coalesce(reservation_expires_at, now()),
        now() + interval '24 hours'
      )
      where id = p_order_id;
    end if;
    analytics_event_name := 'payment_pending';
  elsif normalized_status in ('rejected', 'cancelled') then
    analytics_event_name := 'payment_rejected';
  elsif normalized_status in ('refunded', 'charged_back') then
    if order_record.status in ('pending', 'paid', 'payment_review', 'ready_for_pickup', 'shipped', 'delivered') then
      perform public.cancel_order_and_release(
        p_order_id,
        'Pago devuelto o desconocido',
        false
      );
      next_status := 'cancelled';
    end if;
  end if;

  update public.order_payment_attempts
  set
    external_id = coalesce(nullif(btrim(p_external_id), ''), external_id),
    status = normalized_status,
    status_detail = nullif(btrim(p_payment_status_detail), ''),
    receiver_account_id = coalesce(nullif(btrim(p_receiver_account_id), ''), receiver_account_id),
    updated_at = now(),
    terminal_at = case
      when normalized_status in ('approved', 'rejected', 'cancelled', 'failed', 'refunded', 'charged_back')
      then coalesce(terminal_at, now())
      else null
    end
  where id = p_attempt_id;

  update public.orders
  set
    status = next_status,
    mercadopago_id = case when p_provider = 'mercadopago' then coalesce(nullif(btrim(p_external_id), ''), mercadopago_id) else mercadopago_id end,
    mercadopago_status = case when p_provider = 'mercadopago' then normalized_status else mercadopago_status end,
    mercadopago_status_detail = case when p_provider = 'mercadopago' then nullif(btrim(p_payment_status_detail), '') else mercadopago_status_detail end
  where id = p_order_id;

  if next_status = 'paid' then
    update public.order_items
    set procurement_status = 'pending_collection'
    where order_id = p_order_id
      and procurement_status = 'awaiting_payment';
  end if;

  if analytics_event_name is not null
     and order_record.analytics_session_id is not null then
    select
      event.source,
      event.device_type,
      event.analytics_version,
      event.campaign,
      event.medium,
      event.content
    into first_event
    from public.storefront_analytics_events as event
    where event.session_id = order_record.analytics_session_id
    order by event.created_at asc
    limit 1;

    select least(20, greatest(1, coalesce(sum(item.quantity), 1)))::smallint
    into item_count
    from public.order_items as item
    where item.order_id = p_order_id;

    insert into public.storefront_analytics_events (
      session_id,
      event_name,
      path,
      source,
      device_type,
      quantity,
      order_id,
      analytics_version,
      campaign,
      medium,
      content,
      event_detail,
      payment_id,
      created_at
    ) values (
      order_record.analytics_session_id,
      analytics_event_name,
      '/order-confirmation',
      coalesce(first_event.source, 'direct'),
      coalesce(first_event.device_type, 'mobile'),
      item_count,
      p_order_id,
      coalesce(first_event.analytics_version, 6),
      first_event.campaign,
      first_event.medium,
      first_event.content,
      nullif(btrim(p_payment_status_detail), ''),
      p_external_id,
      now()
    )
    on conflict (event_name, payment_id)
      where event_name in ('payment_rejected', 'payment_pending')
        and payment_id is not null
      do nothing;
  end if;

  return next_status;
end;
$$;

revoke all on function public.apply_order_payment_attempt(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_payment_attempt(uuid, uuid, text, text, text, text, text)
  to service_role;

comment on function public.apply_order_payment_attempt(uuid, uuid, text, text, text, text, text) is
  'Aplica estados de pago sin permitir que eventos tardíos degraden intentos terminales o pagos en revisión.';
