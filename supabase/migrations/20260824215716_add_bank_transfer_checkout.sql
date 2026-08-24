create table public.bank_transfer_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  account_alias text not null default '',
  account_holder text not null default '',
  institution_name text,
  account_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transfer_settings_alias_check
    check (char_length(account_alias) <= 120),
  constraint bank_transfer_settings_holder_check
    check (char_length(account_holder) <= 160),
  constraint bank_transfer_settings_institution_check
    check (institution_name is null or char_length(institution_name) <= 160),
  constraint bank_transfer_settings_account_check
    check (account_number is null or char_length(account_number) <= 64)
);

insert into public.bank_transfer_settings (id) values (1)
on conflict (id) do nothing;

alter table public.bank_transfer_settings enable row level security;
revoke all on table public.bank_transfer_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.bank_transfer_settings to service_role;

alter table public.order_payment_attempts
  drop constraint order_payment_attempts_provider_check,
  add constraint order_payment_attempts_provider_check
    check (provider in ('mercadopago', 'viumi', 'bank_transfer')),
  add column transfer_notified_at timestamptz,
  add column transfer_reviewed_at timestamptz,
  add column transfer_reviewed_by text,
  add column bank_reference text;

create index order_payment_attempts_bank_review_idx
  on public.order_payment_attempts (status, updated_at)
  where provider = 'bank_transfer' and status in ('pending', 'review');

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

create or replace function public.report_bank_transfer(
  p_order_id uuid,
  p_attempt_id uuid
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

  notified_at := now();
  update public.order_payment_attempts
  set status = 'review', transfer_notified_at = notified_at, updated_at = notified_at
  where id = p_attempt_id;
  update public.orders
  set status = 'payment_review', reservation_expires_at = notified_at + interval '24 hours'
  where id = p_order_id;
  return notified_at;
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
begin
  if nullif(btrim(p_reviewed_by), '') is null then
    raise exception 'Falta identificar al administrador';
  end if;

  select status, stock_reserved into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select status into attempt_record
  from public.order_payment_attempts
  where id = p_attempt_id and order_id = p_order_id and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;

  if attempt_record.status = 'approved' then return false; end if;
  if attempt_record.status <> 'review' or order_record.status <> 'payment_review'
     or not order_record.stock_reserved then
    raise exception 'La transferencia no está pendiente de acreditación';
  end if;

  update public.order_payment_attempts
  set status = 'approved', bank_reference = nullif(btrim(p_bank_reference), ''),
      transfer_reviewed_by = btrim(p_reviewed_by), transfer_reviewed_at = now(),
      terminal_at = now(), updated_at = now()
  where id = p_attempt_id;
  update public.orders set status = 'paid' where id = p_order_id;
  update public.order_items set procurement_status = 'pending_collection'
  where order_id = p_order_id and procurement_status = 'awaiting_payment';
  return true;
end;
$$;

create or replace function public.reject_bank_transfer(
  p_order_id uuid,
  p_attempt_id uuid,
  p_reason text default 'Transferencia no recibida'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_status text;
begin
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
  set status = 'cancelled', status_detail = coalesce(nullif(btrim(p_reason), ''), 'Transferencia no recibida'),
      terminal_at = now(), updated_at = now()
  where id = p_attempt_id;
  perform public.cancel_order_and_release(
    p_order_id,
    coalesce(nullif(btrim(p_reason), ''), 'Transferencia no recibida'),
    false
  );
  return true;
end;
$$;

create or replace function public.replace_bank_transfer_attempt(
  p_order_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_status text;
  attempt_status text;
begin
  select status into order_status from public.orders where id = p_order_id for update;
  if order_status <> 'pending' then
    raise exception 'El método de pago ya no puede cambiarse';
  end if;
  select status into attempt_status
  from public.order_payment_attempts
  where id = p_attempt_id and order_id = p_order_id and provider = 'bank_transfer'
  for update;
  if not found then raise exception 'Intento de transferencia no encontrado'; end if;
  if attempt_status <> 'pending' then
    raise exception 'El método de pago ya no puede cambiarse';
  end if;
  update public.order_payment_attempts
  set status = 'cancelled', status_detail = 'Reemplazado por Mercado Pago',
      terminal_at = now(), updated_at = now()
  where id = p_attempt_id;
  return true;
end;
$$;

create or replace function public.create_order_bank_refund(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  item_record record;
  remaining numeric(10,2);
  refund_amount numeric(10,2);
  existing_total numeric(10,2);
begin
  select status, total into order_record
  from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  select coalesce(sum(amount), 0) into existing_total
  from public.manual_refunds
  where order_id = p_order_id and status in ('pending', 'paid');
  if existing_total >= order_record.total then return existing_total; end if;

  remaining := order_record.total - existing_total;
  for item_record in
    select id, greatest(coalesce(net_amount, unit_price * quantity), 0)::numeric(10,2) as amount
    from public.order_items item
    where order_id = p_order_id
      and not exists (
        select 1 from public.manual_refunds refund
        where refund.order_item_id = item.id and refund.status in ('pending', 'paid')
      )
    order by id
  loop
    refund_amount := least(remaining, item_record.amount);
    if refund_amount > 0 then
      insert into public.manual_refunds (order_id, order_item_id, method, status, amount, notes)
      values (p_order_id, item_record.id, 'bank_transfer', 'pending', refund_amount,
        'Devolución bancaria por cancelación de transferencia acreditada');
      remaining := remaining - refund_amount;
    end if;
  end loop;

  if remaining > 0 then
    update public.manual_refunds
    set amount = amount + remaining
    where id = (
      select id from public.manual_refunds
      where order_id = p_order_id and status = 'pending'
      order by created_at desc limit 1
    );
  end if;

  update public.orders set refund_status = 'pending' where id = p_order_id;
  return order_record.total;
end;
$$;

create or replace function public.sync_bank_transfer_refund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_total numeric(10,2);
  paid_total numeric(10,2);
begin
  if new.status <> 'paid' then return new; end if;
  select total into order_total from public.orders where id = new.order_id;
  select coalesce(sum(amount), 0) into paid_total
  from public.manual_refunds where order_id = new.order_id and status = 'paid';
  if paid_total >= order_total then
    update public.order_payment_attempts
    set status = 'refunded', bank_reference = coalesce(new.transfer_reference, bank_reference),
        terminal_at = coalesce(terminal_at, now()), updated_at = now()
    where order_id = new.order_id and provider = 'bank_transfer' and status = 'approved';
  end if;
  return new;
end;
$$;

create trigger manual_refunds_sync_bank_transfer
after update of status on public.manual_refunds
for each row execute function public.sync_bank_transfer_refund_status();

revoke all on function public.sync_bank_transfer_refund_status() from public, anon, authenticated;

revoke all on function public.create_bank_transfer_attempt(uuid) from public, anon, authenticated;
revoke all on function public.report_bank_transfer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approve_bank_transfer(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.reject_bank_transfer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.replace_bank_transfer_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_order_bank_refund(uuid) from public, anon, authenticated;
grant execute on function public.create_bank_transfer_attempt(uuid) to service_role;
grant execute on function public.report_bank_transfer(uuid, uuid) to service_role;
grant execute on function public.approve_bank_transfer(uuid, uuid, text, text) to service_role;
grant execute on function public.reject_bank_transfer(uuid, uuid, text) to service_role;
grant execute on function public.replace_bank_transfer_attempt(uuid, uuid) to service_role;
grant execute on function public.create_order_bank_refund(uuid) to service_role;
