alter table public.order_payment_reconciliation_events
  drop constraint if exists order_payment_reconciliation_source_check,
  add constraint order_payment_reconciliation_source_check
    check (source in (
      'webhook',
      'buyer_return',
      'order_query',
      'expiration_cron',
      'admin_resolution'
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
  previous_status text;
  next_status text;
  effective_status text := p_payment_status;
  effective_detail text := p_payment_status_detail;
begin
  if p_source not in (
    'webhook',
    'buyer_return',
    'order_query',
    'expiration_cron',
    'admin_resolution'
  ) then
    raise exception 'Origen de conciliacion invalido';
  end if;
  if jsonb_typeof(coalesce(p_candidate_payment_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de pagos candidatos no es valida';
  end if;

  select status into previous_status
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if p_ambiguous and p_payment_status = 'approved' then
    effective_status := 'review';
    effective_detail := 'Varios pagos aprobados para la misma orden';
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
    previous_status,
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

comment on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) is
  'Aplica una conciliacion de pago y registra de forma atomica el pago y origen, incluida la resolucion administrativa de pagos multiples.';

create table public.order_payment_review_resolutions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  selected_payment_id text not null,
  candidate_payment_ids jsonb not null,
  claim_token uuid not null,
  status text not null,
  claimed_by text not null,
  error_message text,
  claimed_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint order_payment_review_resolution_status_check
    check (status in ('resolving', 'failed', 'resolved')),
  constraint order_payment_review_resolution_candidates_check
    check (jsonb_typeof(candidate_payment_ids) = 'array')
);

alter table public.order_payment_review_resolutions enable row level security;
revoke all on table public.order_payment_review_resolutions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.order_payment_review_resolutions to service_role;

create or replace function public.claim_mercadopago_payment_review(
  p_order_id uuid,
  p_selected_payment_id text,
  p_candidate_payment_ids jsonb,
  p_claim_token uuid,
  p_claimed_by text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_order_id uuid;
begin
  if nullif(btrim(p_claimed_by), '') is null then
    raise exception 'Falta identificar al administrador';
  end if;

  insert into public.order_payment_review_resolutions (
    order_id,
    selected_payment_id,
    candidate_payment_ids,
    claim_token,
    status,
    claimed_by,
    claimed_at
  ) values (
    p_order_id,
    btrim(p_selected_payment_id),
    p_candidate_payment_ids,
    p_claim_token,
    'resolving',
    btrim(p_claimed_by),
    now()
  )
  on conflict (order_id) do update
  set selected_payment_id = excluded.selected_payment_id,
      candidate_payment_ids = excluded.candidate_payment_ids,
      claim_token = excluded.claim_token,
      status = 'resolving',
      claimed_by = excluded.claimed_by,
      error_message = null,
      claimed_at = now(),
      resolved_at = null
  where public.order_payment_review_resolutions.status = 'failed'
     or (
       public.order_payment_review_resolutions.status = 'resolving'
       and public.order_payment_review_resolutions.claimed_at < now() - interval '5 minutes'
     )
  returning order_id into claimed_order_id;

  return claimed_order_id is not null;
end;
$$;

revoke all on function public.claim_mercadopago_payment_review(
  uuid, text, jsonb, uuid, text
) from public, anon, authenticated;
grant execute on function public.claim_mercadopago_payment_review(
  uuid, text, jsonb, uuid, text
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

  select status, stock_reserved into order_record
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if order_record.status <> 'payment_review' or not order_record.stock_reserved then
    raise exception 'La orden ya no admite resolver el pago';
  end if;

  select id, status into attempt_record
  from public.order_payment_attempts
  where order_id = p_order_id
    and provider = 'mercadopago'
    and status = 'review'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'No existe un intento de Mercado Pago en revision'; end if;

  update public.order_payment_attempts
  set external_id = btrim(p_selected_payment_id),
      status = 'approved',
      status_detail = 'Pago múltiple resuelto por un administrador',
      receiver_account_id = nullif(btrim(p_receiver_account_id), ''),
      updated_at = now(),
      terminal_at = now()
  where id = attempt_record.id;

  update public.orders
  set status = 'paid',
      mercadopago_id = btrim(p_selected_payment_id),
      mercadopago_status = 'approved',
      mercadopago_status_detail = 'Pago múltiple resuelto por un administrador'
  where id = p_order_id;

  update public.order_items
  set procurement_status = 'pending_collection'
  where order_id = p_order_id
    and procurement_status = 'awaiting_payment';

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
    'paid',
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
