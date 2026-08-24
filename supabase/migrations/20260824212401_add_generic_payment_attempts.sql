create table if not exists public.order_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null,
  external_id text,
  status text not null default 'created',
  status_detail text,
  checkout_url text,
  amount numeric(10, 2) not null,
  currency text not null default 'ARS',
  receiver_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  constraint order_payment_attempts_provider_check
    check (provider in ('mercadopago', 'viumi')),
  constraint order_payment_attempts_status_check
    check (status in (
      'created', 'pending', 'in_process', 'approved', 'rejected',
      'cancelled', 'failed', 'review', 'refunded', 'charged_back'
    )),
  constraint order_payment_attempts_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint order_payment_attempts_amount_check check (amount > 0)
);

create unique index if not exists order_payment_attempts_external_uidx
  on public.order_payment_attempts (provider, external_id)
  where external_id is not null;

create unique index if not exists order_payment_attempts_one_active_uidx
  on public.order_payment_attempts (order_id)
  where status in ('created', 'pending', 'in_process', 'review');

create index if not exists order_payment_attempts_order_created_idx
  on public.order_payment_attempts (order_id, created_at desc);

alter table public.order_payment_attempts enable row level security;
revoke all on table public.order_payment_attempts from anon, authenticated;
grant select, insert, update, delete on table public.order_payment_attempts to service_role;

insert into public.order_payment_attempts (
  order_id,
  provider,
  external_id,
  status,
  status_detail,
  amount,
  currency,
  terminal_at,
  created_at,
  updated_at
)
select
  orders.id,
  'mercadopago',
  orders.mercadopago_id,
  case
    when orders.mercadopago_status in ('approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
      then orders.mercadopago_status
    when orders.mercadopago_status in ('pending', 'in_process')
      then orders.mercadopago_status
    when orders.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
      then 'approved'
    else 'failed'
  end,
  orders.mercadopago_status_detail,
  orders.total,
  'ARS',
  case
    when orders.mercadopago_status in ('approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
      or orders.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
    then coalesce(orders.created_at, now())
    else null
  end,
  coalesce(orders.created_at, now()),
  now()
from public.orders as orders
where orders.mercadopago_id is not null
   or orders.mercadopago_status is not null
on conflict do nothing;

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

  if attempt_record.status in ('approved', 'refunded', 'charged_back')
     and attempt_record.status = normalized_status then
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

create or replace function public.apply_order_payment(
  p_order_id uuid,
  p_payment_id text,
  p_payment_status text,
  p_payment_status_detail text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_id uuid;
begin
  select attempt.id into attempt_id
  from public.order_payment_attempts as attempt
  where attempt.order_id = p_order_id
    and attempt.provider = 'mercadopago'
    and (
      attempt.external_id = p_payment_id
      or attempt.status in ('created', 'pending', 'in_process', 'review')
    )
  order by (attempt.external_id = p_payment_id) desc, attempt.created_at desc
  limit 1;

  if attempt_id is null then
    insert into public.order_payment_attempts (
      order_id, provider, external_id, status, amount, currency
    )
    select id, 'mercadopago', p_payment_id, 'created', total, 'ARS'
    from public.orders
    where id = p_order_id
    returning id into attempt_id;
  end if;

  return public.apply_order_payment_attempt(
    p_order_id,
    attempt_id,
    'mercadopago',
    p_payment_id,
    p_payment_status,
    p_payment_status_detail,
    null
  );
end;
$$;

revoke all on function public.apply_order_payment(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_payment(uuid, text, text, text)
  to service_role;

comment on table public.order_payment_attempts is
  'Intentos de pago independientes del pedido. Las columnas mercadopago_* de orders se conservan temporalmente por compatibilidad.';
