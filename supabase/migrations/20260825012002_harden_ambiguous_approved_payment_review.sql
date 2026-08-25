alter table public.admin_notifications
  drop constraint admin_notifications_event_key_check,
  add constraint admin_notifications_event_key_check
    check (event_key in (
      'sale_paid',
      'late_approved',
      'payment_persistence_failure',
      'payment_review'
    ));

create or replace function public.reconcile_order_payment_attempt(
  p_order_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_external_id text,
  p_payment_status text,
  p_payment_status_detail text,
  p_receiver_account_id text,
  p_source text,
  p_ambiguous boolean default false,
  p_candidate_payment_ids jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  next_status text;
  effective_status text := p_payment_status;
  effective_detail text := p_payment_status_detail;
begin
  if p_source not in (
    'webhook', 'buyer_return', 'order_query', 'expiration_cron', 'admin_resolution'
  ) then
    raise exception 'Origen de conciliacion invalido';
  end if;
  if jsonb_typeof(coalesce(p_candidate_payment_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de pagos candidatos no es valida';
  end if;

  select status, stock_reserved, stock_restored
  into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if p_ambiguous and p_payment_status = 'approved' then
    effective_status := 'review';
    effective_detail := 'multiple_approved:requires_admin_resolution';
  end if;

  next_status := public.apply_order_payment_attempt(
    p_order_id,
    p_attempt_id,
    p_provider,
    p_external_id,
    effective_status,
    effective_detail,
    p_receiver_account_id
  );

  if p_ambiguous and p_payment_status = 'approved' then
    update public.order_payment_attempts
    set status_detail = effective_detail,
        updated_at = now()
    where id = p_attempt_id
      and status in ('approved', 'review');

    update public.orders
    set status = 'payment_review',
        mercadopago_status = case
          when p_provider = 'mercadopago' then 'review'
          else mercadopago_status
        end,
        mercadopago_status_detail = case
          when p_provider = 'mercadopago' then effective_detail
          else mercadopago_status_detail
        end
    where id = p_order_id;

    insert into public.admin_notifications (order_id, event_key)
    values (p_order_id, 'payment_review')
    on conflict (order_id, event_key) do nothing;

    next_status := 'payment_review';
  end if;

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
    p_attempt_id,
    p_source,
    p_external_id,
    p_payment_status,
    order_record.status,
    next_status,
    p_ambiguous,
    coalesce(p_candidate_payment_ids, '[]'::jsonb)
  ) on conflict do nothing;

  return next_status;
end;
$$;

revoke all on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) to service_role;

create or replace function public.resolve_mercadopago_payment_review(
  p_order_id uuid,
  p_selected_payment_id text,
  p_receiver_account_id text,
  p_candidate_payment_ids jsonb,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  attempt_record record;
  resolution_record record;
  next_order_status text;
  resolved_detail text;
begin
  if nullif(btrim(p_selected_payment_id), '') is null then
    raise exception 'Falta el pago seleccionado';
  end if;
  if jsonb_typeof(coalesce(p_candidate_payment_ids, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_candidate_payment_ids, '[]'::jsonb)) < 2 then
    raise exception 'La lista de pagos candidatos no es valida';
  end if;
  if not coalesce(p_candidate_payment_ids, '[]'::jsonb) ? p_selected_payment_id then
    raise exception 'El pago seleccionado no pertenece a la revision';
  end if;

  select status, claim_token, selected_payment_id, candidate_payment_ids
  into resolution_record
  from public.order_payment_review_resolutions
  where order_id = p_order_id
  for update;
  if not found
     or resolution_record.status <> 'resolving'
     or resolution_record.claim_token <> p_claim_token
     or resolution_record.selected_payment_id <> btrim(p_selected_payment_id)
     or resolution_record.candidate_payment_ids <> p_candidate_payment_ids then
    raise exception 'La resolucion no tiene un bloqueo administrativo valido';
  end if;

  select status, stock_reserved, stock_restored
  into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if order_record.status <> 'payment_review'
     or (not order_record.stock_reserved and not order_record.stock_restored) then
    raise exception 'La orden ya no admite resolver el pago';
  end if;

  select id, status into attempt_record
  from public.order_payment_attempts
  where order_id = p_order_id
    and provider = 'mercadopago'
    and status in ('review', 'approved')
  order by (status = 'review') desc, created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'No existe un intento de Mercado Pago conciliable';
  end if;

  if order_record.stock_reserved and not order_record.stock_restored then
    next_order_status := 'paid';
    resolved_detail := 'multiple_approved:resolved_by_admin';
  else
    next_order_status := 'payment_review';
    resolved_detail := 'late_approved:multiple_payments_resolved';
  end if;

  update public.order_payment_attempts
  set external_id = btrim(p_selected_payment_id),
      status = 'approved',
      status_detail = resolved_detail,
      receiver_account_id = nullif(btrim(p_receiver_account_id), ''),
      updated_at = now(),
      terminal_at = now()
  where id = attempt_record.id;

  update public.orders
  set status = next_order_status,
      mercadopago_id = btrim(p_selected_payment_id),
      mercadopago_status = 'approved',
      mercadopago_status_detail = resolved_detail
  where id = p_order_id;

  if next_order_status = 'paid' then
    update public.order_items
    set procurement_status = 'pending_collection'
    where order_id = p_order_id
      and procurement_status = 'awaiting_payment';
  else
    insert into public.admin_notifications (order_id, event_key)
    values (p_order_id, 'late_approved')
    on conflict (order_id, event_key) do nothing;
  end if;

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
    btrim(p_selected_payment_id),
    'approved',
    'payment_review',
    next_order_status,
    false,
    p_candidate_payment_ids
  ) on conflict do nothing;

  update public.order_payment_review_resolutions
  set status = 'resolved', resolved_at = now(), error_message = null
  where order_id = p_order_id and claim_token = p_claim_token;

  return true;
end;
$$;

revoke all on function public.resolve_mercadopago_payment_review(
  uuid, text, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.resolve_mercadopago_payment_review(
  uuid, text, text, jsonb, uuid
) to service_role;
