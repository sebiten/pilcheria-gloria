alter table public.order_payment_attempts
  add column review_deadline_at timestamptz,
  add column review_max_deadline_at timestamptz,
  add column review_escalated_at timestamptz,
  add column review_resolution text,
  add column review_notes text,
  add column proof_reference text;

update public.order_payment_attempts
set review_deadline_at = coalesce(transfer_notified_at, updated_at) + interval '24 hours',
    review_max_deadline_at = coalesce(transfer_notified_at, updated_at) + interval '48 hours'
where provider = 'bank_transfer'
  and status = 'review';

update public.order_payment_attempts
set review_resolution = case
  when status in ('approved', 'refunded', 'charged_back') then 'approved'
  when status in ('rejected', 'cancelled', 'failed') then 'rejected'
  else review_resolution
end
where provider = 'bank_transfer'
  and status in ('approved', 'refunded', 'charged_back', 'rejected', 'cancelled', 'failed');

set constraints all immediate;

alter table public.order_payment_attempts
  add constraint order_payment_attempts_review_resolution_check
    check (
      review_resolution is null or review_resolution in (
        'approved',
        'rejected',
        'expired_stock_released',
        'approved_after_stock_release'
      )
    ),
  add constraint order_payment_attempts_bank_review_deadlines_check
    check (
      provider <> 'bank_transfer'
      or status <> 'review'
      or (
        review_deadline_at is not null
        and review_max_deadline_at is not null
        and review_max_deadline_at >= review_deadline_at
      )
    ) not valid;

alter table public.order_payment_attempts
  validate constraint order_payment_attempts_bank_review_deadlines_check;

drop index if exists public.order_payment_attempts_bank_review_idx;
create index order_payment_attempts_bank_review_deadline_idx
  on public.order_payment_attempts (review_deadline_at, review_max_deadline_at)
  where provider = 'bank_transfer'
    and status = 'review'
    and review_resolution is null;

alter table public.admin_notifications
  drop constraint admin_notifications_event_key_check,
  add constraint admin_notifications_event_key_check
    check (event_key in (
      'sale_paid',
      'late_approved',
      'payment_persistence_failure',
      'bank_transfer_review_overdue',
      'bank_transfer_review_expired'
    ));

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
  related_open_count integer;
  related_report_count integer;
begin
  select id, status, total, stock_reserved, reservation_expires_at,
         clerk_user_id, checkout_owner_fingerprint,
         nullif(btrim(shipping_address ->> 'phone'), '') as phone
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
         and char_length(regexp_replace(coalesce(whatsapp_phone, ''), '\\D', '', 'g')) between 10 and 13
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

  select count(*)::integer
  into related_open_count
  from public.order_payment_attempts attempt
  join public.orders related_order on related_order.id = attempt.order_id
  where attempt.provider = 'bank_transfer'
    and attempt.status in ('pending', 'review')
    and related_order.id <> p_order_id
    and (
      (order_record.clerk_user_id is not null and related_order.clerk_user_id = order_record.clerk_user_id)
      or (order_record.checkout_owner_fingerprint is not null and related_order.checkout_owner_fingerprint = order_record.checkout_owner_fingerprint)
      or (order_record.phone is not null and nullif(btrim(related_order.shipping_address ->> 'phone'), '') = order_record.phone)
    );

  if related_open_count >= 2 then
    raise exception 'Alcanzaste el límite de transferencias abiertas. Resolvé una antes de continuar';
  end if;

  select count(*)::integer
  into related_report_count
  from public.order_payment_attempts attempt
  join public.orders related_order on related_order.id = attempt.order_id
  where attempt.provider = 'bank_transfer'
    and attempt.transfer_notified_at >= now() - interval '24 hours'
    and (
      (order_record.clerk_user_id is not null and related_order.clerk_user_id = order_record.clerk_user_id)
      or (order_record.checkout_owner_fingerprint is not null and related_order.checkout_owner_fingerprint = order_record.checkout_owner_fingerprint)
      or (order_record.phone is not null and nullif(btrim(related_order.shipping_address ->> 'phone'), '') = order_record.phone)
    );

  if related_report_count >= 4 then
    raise exception 'Alcanzaste el límite diario de transferencias informadas';
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

drop function public.report_bank_transfer(uuid, uuid);
create function public.report_bank_transfer(
  p_order_id uuid,
  p_attempt_id uuid,
  p_proof_reference text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  notified_at timestamptz;
begin
  select status, stock_reserved into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select status, transfer_notified_at into attempt_record
  from public.order_payment_attempts
  where id = p_attempt_id and order_id = p_order_id and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;

  if attempt_record.status = 'review' and attempt_record.transfer_notified_at is not null then
    return attempt_record.transfer_notified_at;
  end if;
  if attempt_record.status <> 'pending' or order_record.status <> 'pending'
     or not order_record.stock_reserved then
    raise exception 'La transferencia ya no puede informarse';
  end if;
  if p_proof_reference is not null and char_length(btrim(p_proof_reference)) > 200 then
    raise exception 'La referencia del comprobante es demasiado larga';
  end if;

  notified_at := now();
  update public.order_payment_attempts
  set status = 'review',
      transfer_notified_at = notified_at,
      review_deadline_at = notified_at + interval '24 hours',
      review_max_deadline_at = notified_at + interval '48 hours',
      review_escalated_at = null,
      review_resolution = null,
      proof_reference = nullif(btrim(p_proof_reference), ''),
      status_detail = 'bank_transfer_review:pending',
      updated_at = notified_at
  where id = p_attempt_id;
  update public.orders
  set status = 'payment_review',
      reservation_expires_at = notified_at + interval '24 hours'
  where id = p_order_id;
  return notified_at;
end;
$$;

create or replace function public.process_expired_bank_transfer_review(
  p_order_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  processed_at timestamptz := now();
begin
  select status, stock_reserved, stock_restored
  into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select status, review_deadline_at, review_max_deadline_at,
         review_escalated_at, review_resolution
  into attempt_record
  from public.order_payment_attempts
  where id = p_attempt_id
    and order_id = p_order_id
    and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;

  if attempt_record.status <> 'review' or order_record.status <> 'payment_review' then
    return 'ignored';
  end if;
  if attempt_record.review_resolution = 'expired_stock_released' then
    return 'already_expired';
  end if;
  if attempt_record.review_resolution is not null then
    return 'resolved';
  end if;
  if attempt_record.review_deadline_at is null or attempt_record.review_max_deadline_at is null then
    raise exception 'La revisión no tiene deadlines operativos';
  end if;
  if processed_at < attempt_record.review_deadline_at then
    return 'not_due';
  end if;

  if processed_at < attempt_record.review_max_deadline_at then
    if attempt_record.review_escalated_at is null then
      update public.order_payment_attempts
      set review_escalated_at = processed_at,
          status_detail = 'bank_transfer_review:escalated',
          review_notes = coalesce(review_notes, 'SLA inicial vencido; requiere revisión administrativa'),
          updated_at = processed_at
      where id = p_attempt_id;
      update public.orders
      set reservation_expires_at = attempt_record.review_max_deadline_at
      where id = p_order_id;
      insert into public.payment_flow_events (
        event_name, order_id, attempt_id, provider, new_status, route, metadata
      ) values (
        'bank_transfer.review_escalated', p_order_id, p_attempt_id,
        'bank_transfer', 'review', 'expiration_cron',
        jsonb_build_object('deadline_at', attempt_record.review_deadline_at,
                           'max_deadline_at', attempt_record.review_max_deadline_at)
      );
      insert into public.admin_notifications (order_id, event_key)
      values (p_order_id, 'bank_transfer_review_overdue')
      on conflict (order_id, event_key) do nothing;
      return 'escalated';
    end if;
    return 'awaiting_max_deadline';
  end if;

  if order_record.stock_reserved and not order_record.stock_restored then
    perform public.release_order_stock(
      p_order_id,
      'Revisión de transferencia vencida; stock liberado, pago aún por resolver'
    );
  end if;

  update public.orders
  set status = 'payment_review',
      reservation_expires_at = null
  where id = p_order_id;
  update public.order_payment_attempts
  set review_escalated_at = coalesce(review_escalated_at, processed_at),
      review_resolution = 'expired_stock_released',
      status_detail = 'bank_transfer_review:expired_stock_released',
      review_notes = coalesce(review_notes || E'\n', '') ||
        'Deadline máximo vencido; stock y cupón liberados. Verificar acreditación antes de resolver.',
      updated_at = processed_at
  where id = p_attempt_id;
  insert into public.payment_flow_events (
    event_name, order_id, attempt_id, provider, new_status, route, metadata
  ) values (
    'bank_transfer.review_expired', p_order_id, p_attempt_id,
    'bank_transfer', 'review', 'expiration_cron',
    jsonb_build_object('stock_released', true,
                       'max_deadline_at', attempt_record.review_max_deadline_at)
  );
  insert into public.admin_notifications (order_id, event_key)
  values (p_order_id, 'bank_transfer_review_expired')
  on conflict (order_id, event_key) do nothing;
  return 'expired_stock_released';
end;
$$;

create or replace function public.approve_bank_transfer(
  p_order_id uuid,
  p_attempt_id uuid,
  p_reviewed_by text,
  p_bank_reference text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  reviewed_at timestamptz := now();
begin
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'Falta identificar al administrador';
  end if;

  select status, stock_reserved, stock_restored into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select status, review_resolution into attempt_record
  from public.order_payment_attempts
  where id = p_attempt_id and order_id = p_order_id and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;

  if attempt_record.status = 'approved' then return false; end if;
  if attempt_record.status <> 'review' or order_record.status <> 'payment_review' then
    raise exception 'La transferencia no está pendiente de acreditación';
  end if;

  if order_record.stock_reserved and not order_record.stock_restored then
    update public.order_payment_attempts
    set status = 'approved', bank_reference = nullif(btrim(p_bank_reference), ''),
        transfer_reviewed_by = btrim(p_reviewed_by), transfer_reviewed_at = reviewed_at,
        review_resolution = 'approved', review_notes = 'Acreditación confirmada por administración',
        status_detail = 'bank_transfer:approved',
        terminal_at = reviewed_at, updated_at = reviewed_at
    where id = p_attempt_id;
    update public.orders set status = 'paid', reservation_expires_at = null
    where id = p_order_id;
    update public.order_items set procurement_status = 'pending_collection'
    where order_id = p_order_id and procurement_status = 'awaiting_payment';
    return true;
  end if;

  if attempt_record.review_resolution <> 'expired_stock_released'
     or not order_record.stock_restored then
    raise exception 'La transferencia no puede aprobarse en su estado actual';
  end if;

  update public.order_payment_attempts
  set status = 'approved', bank_reference = nullif(btrim(p_bank_reference), ''),
      transfer_reviewed_by = btrim(p_reviewed_by), transfer_reviewed_at = reviewed_at,
      review_resolution = 'approved_after_stock_release',
      review_notes = coalesce(review_notes || E'\n', '') ||
        'Acreditación confirmada después de liberar stock; requiere cumplimiento o reembolso.',
      status_detail = 'bank_transfer:approved_after_stock_release',
      terminal_at = reviewed_at, updated_at = reviewed_at
  where id = p_attempt_id;
  update public.orders
  set status = 'payment_review', reservation_expires_at = null
  where id = p_order_id;
  insert into public.admin_notifications (order_id, event_key)
  values (p_order_id, 'bank_transfer_review_expired')
  on conflict (order_id, event_key) do nothing;
  return true;
end;
$$;

drop function public.reject_bank_transfer(uuid, uuid, text);
create function public.reject_bank_transfer(
  p_order_id uuid,
  p_attempt_id uuid,
  p_reason text default 'Transferencia no recibida',
  p_reviewed_by text default 'system'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_status text;
  reviewed_at timestamptz := now();
begin
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'Falta identificar quién resolvió la transferencia';
  end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select status into attempt_status
  from public.order_payment_attempts
  where id = p_attempt_id and order_id = p_order_id and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;
  if attempt_status in ('cancelled', 'rejected', 'failed') then return false; end if;
  if attempt_status not in ('pending', 'review') then
    raise exception 'La transferencia ya no puede rechazarse';
  end if;

  update public.order_payment_attempts
  set status = 'cancelled',
      status_detail = coalesce(nullif(btrim(p_reason), ''), 'Transferencia no recibida'),
      review_resolution = 'rejected',
      review_notes = coalesce(nullif(btrim(p_reason), ''), 'Transferencia no recibida'),
      transfer_reviewed_by = btrim(p_reviewed_by),
      transfer_reviewed_at = reviewed_at,
      terminal_at = reviewed_at, updated_at = reviewed_at
  where id = p_attempt_id;
  perform public.cancel_order_and_release(
    p_order_id,
    coalesce(nullif(btrim(p_reason), ''), 'Transferencia no recibida'),
    false
  );
  return true;
end;
$$;

revoke all on function public.create_bank_transfer_attempt(uuid)
  from public, anon, authenticated;
revoke all on function public.report_bank_transfer(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.process_expired_bank_transfer_review(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.approve_bank_transfer(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.reject_bank_transfer(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.create_bank_transfer_attempt(uuid) to service_role;
grant execute on function public.report_bank_transfer(uuid, uuid, text) to service_role;
grant execute on function public.process_expired_bank_transfer_review(uuid, uuid) to service_role;
grant execute on function public.approve_bank_transfer(uuid, uuid, text, text) to service_role;
grant execute on function public.reject_bank_transfer(uuid, uuid, text, text) to service_role;

comment on function public.process_expired_bank_transfer_review(uuid, uuid) is
  'Escala una revisión bancaria al vencer el SLA y libera stock/cupón una sola vez al superar el deadline máximo, sin ocultar una posible acreditación.';
