alter table public.payment_flow_events
  add column provider_checkout_id text;

create or replace function private.capture_payment_flow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'orders' then
    if tg_op = 'INSERT' then
      insert into public.payment_flow_events (event_name, order_id, new_status)
      values ('order.created', new.id, new.status);
    else
      if old.status is distinct from new.status then
        insert into public.payment_flow_events (
          event_name, order_id, previous_status, new_status, failure_reason
        ) values (
          'order.status_changed', new.id, old.status, new.status, new.cancel_reason
        );
      end if;

      if not old.stock_reserved and new.stock_reserved then
        insert into public.payment_flow_events (event_name, order_id, new_status)
        values ('stock.reserved', new.id, new.status);
      end if;

      if not old.stock_restored and new.stock_restored then
        insert into public.payment_flow_events (event_name, order_id, new_status)
        values ('stock.restored', new.id, new.status);
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      insert into public.payment_flow_events (
        event_name,
        order_id,
        attempt_id,
        provider,
        new_status,
        external_id,
        provider_checkout_id
      ) values (
        'payment.attempt_created',
        new.order_id,
        new.id,
        new.provider,
        new.status,
        new.external_id,
        new.provider_checkout_id
      );
    elsif old.status is distinct from new.status then
      insert into public.payment_flow_events (
        event_name,
        order_id,
        attempt_id,
        provider,
        previous_status,
        new_status,
        external_id,
        provider_checkout_id,
        failure_reason
      ) values (
        case
          when new.provider = 'bank_transfer' and new.status = 'review'
            then 'bank_transfer.reported'
          when new.provider = 'bank_transfer' and new.status = 'approved'
            then 'bank_transfer.approved'
          when new.provider = 'bank_transfer' and new.status in ('rejected', 'cancelled')
            then 'bank_transfer.rejected'
          when new.status = 'refunded' then 'payment.refunded'
          else 'payment.status_changed'
        end,
        new.order_id,
        new.id,
        new.provider,
        old.status,
        new.status,
        new.external_id,
        new.provider_checkout_id,
        new.status_detail
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_payment_flow_event()
  from public, anon, authenticated;

create or replace function private.capture_provider_checkout_invalidation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.provider_checkout_invalidation_status is distinct from
     new.provider_checkout_invalidation_status then
    insert into public.payment_flow_events (
      event_name,
      order_id,
      attempt_id,
      provider,
      new_status,
      provider_checkout_id,
      failure_reason,
      metadata
    ) values (
      'payment.checkout_invalidation_' || new.provider_checkout_invalidation_status,
      new.order_id,
      new.id,
      new.provider,
      new.status,
      new.provider_checkout_id,
      new.provider_checkout_invalidation_detail,
      jsonb_build_object(
        'attempted_at', new.provider_checkout_invalidation_at,
        'requires_late_reconciliation',
          new.provider_checkout_invalidation_status <> 'succeeded'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_provider_checkout_invalidation()
  from public, anon, authenticated;

create trigger attempts_capture_checkout_invalidation
after update of provider_checkout_invalidation_status
on public.order_payment_attempts
for each row
execute function private.capture_provider_checkout_invalidation();

create or replace function public.fulfill_late_approved_order(
  p_order_id uuid,
  p_reviewed_by text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  item_record record;
  offer_record record;
  changed_id uuid;
begin
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'Falta identificar al administrador';
  end if;

  select status, stock_reserved, stock_restored
  into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  select id, external_id, status, status_detail
  into attempt_record
  from public.order_payment_attempts
  where order_id = p_order_id
    and status = 'approved'
    and status_detail like 'late_approved:%'
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No existe una aprobacion tardia conciliable';
  end if;

  if order_record.status = 'paid' and order_record.stock_reserved then
    return true;
  end if;

  if order_record.status <> 'payment_review'
     or order_record.stock_reserved
     or not order_record.stock_restored then
    raise exception 'La orden ya no admite reservar stock por aprobacion tardia';
  end if;

  for item_record in
    select offer_id, min(variant_id::text)::uuid as variant_id,
           sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id and offer_id is not null
    group by offer_id
    order by offer_id
  loop
    select id, variant_id, availability_mode, stock_quantity, active
    into offer_record
    from public.variant_offers
    where id = item_record.offer_id
    for update;

    if not found or not offer_record.active then
      raise exception 'Una oferta del pedido ya no esta disponible';
    end if;
    if offer_record.variant_id <> item_record.variant_id then
      raise exception 'La oferta ya no coincide con la variante comprada';
    end if;

    if offer_record.availability_mode = 'finite' then
      if offer_record.stock_quantity < item_record.quantity then
        raise exception 'No hay stock suficiente para cumplir el pago tardio';
      end if;

      update public.variant_offers
      set stock_quantity = stock_quantity - item_record.quantity,
          updated_at = now()
      where id = item_record.offer_id;

      update public.product_variants as variant
      set stock = coalesce((
        select sum(offer.stock_quantity)::integer
        from public.variant_offers as offer
        where offer.variant_id = variant.id
          and offer.active
          and offer.availability_mode = 'finite'
      ), 0)
      where variant.id = offer_record.variant_id;
    end if;
  end loop;

  for item_record in
    select variant_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id
      and offer_id is null
      and variant_id is not null
    group by variant_id
    order by variant_id
  loop
    changed_id := null;
    update public.product_variants
    set stock = stock - item_record.quantity
    where id = item_record.variant_id
      and stock >= item_record.quantity
    returning id into changed_id;

    if changed_id is null then
      raise exception 'No hay stock suficiente para una variante legacy';
    end if;
  end loop;

  perform public.claim_order_coupon(p_order_id);

  update public.orders
  set status = 'paid',
      stock_reserved = true,
      stock_restored = false,
      cancel_reason = null
  where id = p_order_id;

  update public.order_items
  set procurement_status = case
    when availability_mode = 'on_demand' then 'pending_collection'
    else 'not_required'
  end
  where order_id = p_order_id
    and procurement_status in ('cancelled', 'awaiting_payment');

  insert into public.order_payment_reconciliation_events (
    order_id,
    attempt_id,
    source,
    payment_id,
    payment_status,
    previous_order_status,
    next_order_status,
    ambiguous,
    candidate_payment_ids
  ) values (
    p_order_id,
    attempt_record.id,
    'admin_resolution',
    attempt_record.external_id,
    'approved',
    'payment_review',
    'paid',
    false,
    jsonb_build_array(attempt_record.external_id)
  ) on conflict do nothing;

  insert into public.payment_flow_events (
    event_name,
    order_id,
    attempt_id,
    provider,
    previous_status,
    new_status,
    external_id,
    route,
    metadata
  ) values (
    'payment.late_approved_fulfilled',
    p_order_id,
    attempt_record.id,
    'mercadopago',
    'payment_review',
    'paid',
    attempt_record.external_id,
    'admin_resolution',
    jsonb_build_object('reviewed_by', btrim(p_reviewed_by))
  );

  return true;
end;
$$;

revoke all on function public.fulfill_late_approved_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fulfill_late_approved_order(uuid, text)
  to service_role;

comment on function public.fulfill_late_approved_order(uuid, text) is
  'Reserva nuevamente el stock y cupon de una orden con aprobacion tardia. Es idempotente y solo admite intentos aprobados conciliados.';
