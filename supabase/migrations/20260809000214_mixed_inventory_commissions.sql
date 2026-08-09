alter table public.product_variants
  add column if not exists size_system text;

alter table public.product_variants
  drop constraint if exists product_variants_size_system_check;

alter table public.product_variants
  add constraint product_variants_size_system_check
  check (size_system is null or size_system in ('infant', 'adult'));

drop index if exists public.product_variants_product_apparel_unique;

create unique index if not exists product_variants_product_apparel_unique
  on public.product_variants (
    product_id,
    lower(coalesce(size_system, 'legacy')),
    lower(coalesce(size, '')),
    lower(coalesce(color, ''))
  )
  where size is not null;

create table if not exists public.inventory_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source_type text not null,
  seller_share_rate numeric(5,4) not null,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint inventory_sources_type_check
    check (source_type in ('own', 'partner')),
  constraint inventory_sources_share_check
    check (seller_share_rate >= 0 and seller_share_rate <= 1)
);

create table if not exists public.variant_offers (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  source_id uuid not null references public.inventory_sources(id) on delete restrict,
  availability_mode text not null,
  sale_price numeric(10,2) not null,
  stock_quantity integer,
  priority integer not null default 100,
  lead_time_min_hours integer not null default 0,
  lead_time_max_hours integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variant_offers_mode_check
    check (availability_mode in ('finite', 'on_demand')),
  constraint variant_offers_price_check check (sale_price > 0),
  constraint variant_offers_stock_check check (
    (availability_mode = 'finite' and stock_quantity is not null and stock_quantity >= 0)
    or (availability_mode = 'on_demand' and stock_quantity is null)
  ),
  constraint variant_offers_lead_time_check check (
    lead_time_min_hours >= 0 and lead_time_max_hours >= lead_time_min_hours
  )
);

create unique index if not exists variant_offers_active_source_unique
  on public.variant_offers (variant_id, source_id)
  where active = true;

create index if not exists variant_offers_variant_priority_idx
  on public.variant_offers (variant_id, priority, id)
  where active = true;

create index if not exists variant_offers_source_id_idx
  on public.variant_offers (source_id);

alter table public.order_items
  add column if not exists offer_id uuid references public.variant_offers(id) on delete set null,
  add column if not exists source_id uuid references public.inventory_sources(id) on delete set null,
  add column if not exists source_code text,
  add column if not exists source_name text,
  add column if not exists availability_mode text,
  add column if not exists seller_share_rate numeric(5,4),
  add column if not exists line_subtotal numeric(10,2),
  add column if not exists discount_allocated numeric(10,2) not null default 0,
  add column if not exists net_amount numeric(10,2),
  add column if not exists seller_share numeric(10,2),
  add column if not exists partner_share numeric(10,2) not null default 0,
  add column if not exists procurement_status text not null default 'not_required',
  add column if not exists procurement_collected_at timestamptz;

alter table public.order_items
  drop constraint if exists order_items_availability_mode_check,
  drop constraint if exists order_items_seller_share_rate_check,
  drop constraint if exists order_items_amounts_check,
  drop constraint if exists order_items_procurement_status_check;

alter table public.order_items
  add constraint order_items_availability_mode_check
    check (availability_mode is null or availability_mode in ('finite', 'on_demand')),
  add constraint order_items_seller_share_rate_check
    check (seller_share_rate is null or (seller_share_rate >= 0 and seller_share_rate <= 1)),
  add constraint order_items_amounts_check check (
    discount_allocated >= 0
    and partner_share >= 0
    and (line_subtotal is null or line_subtotal >= 0)
    and (net_amount is null or net_amount >= 0)
    and (seller_share is null or seller_share >= 0)
  ),
  add constraint order_items_procurement_status_check check (
    procurement_status in (
      'not_required',
      'awaiting_payment',
      'pending_collection',
      'collected',
      'cancelled'
    )
  );

create index if not exists order_items_offer_id_idx on public.order_items (offer_id);
create index if not exists order_items_source_id_idx on public.order_items (source_id);
create index if not exists order_items_procurement_idx
  on public.order_items (procurement_status, source_id)
  where procurement_status in ('awaiting_payment', 'pending_collection');

create table if not exists public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.inventory_sources(id) on delete restrict,
  total_amount numeric(10,2) not null,
  notes text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint partner_settlements_amount_check check (total_amount > 0)
);

create index if not exists partner_settlements_source_paid_idx
  on public.partner_settlements (source_id, paid_at desc);

create table if not exists public.partner_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.inventory_sources(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  settlement_id uuid references public.partner_settlements(id) on delete set null,
  entry_type text not null,
  amount numeric(10,2) not null,
  description text,
  created_at timestamptz not null default now(),
  constraint partner_ledger_entry_type_check
    check (entry_type in ('sale', 'reversal', 'adjustment')),
  constraint partner_ledger_amount_check check (amount <> 0)
);

create unique index if not exists partner_ledger_order_item_type_unique
  on public.partner_ledger_entries (order_item_id, entry_type)
  where order_item_id is not null and entry_type in ('sale', 'reversal');

create index if not exists partner_ledger_open_source_idx
  on public.partner_ledger_entries (source_id, created_at, id)
  where settlement_id is null;

create index if not exists partner_ledger_order_id_idx
  on public.partner_ledger_entries (order_id);

alter table public.inventory_sources enable row level security;
alter table public.variant_offers enable row level security;
alter table public.partner_settlements enable row level security;
alter table public.partner_ledger_entries enable row level security;

revoke all on table public.inventory_sources from public, anon, authenticated;
revoke all on table public.variant_offers from public, anon, authenticated;
revoke all on table public.partner_settlements from public, anon, authenticated;
revoke all on table public.partner_ledger_entries from public, anon, authenticated;

grant select, insert, update, delete on table public.inventory_sources to service_role;
grant select, insert, update, delete on table public.variant_offers to service_role;
grant select, insert, update, delete on table public.partner_settlements to service_role;
grant select, insert, update, delete on table public.partner_ledger_entries to service_role;

insert into public.inventory_sources (
  code,
  name,
  source_type,
  seller_share_rate,
  priority,
  active
)
values
  ('own', 'Stock propio', 'own', 1, 10, true),
  ('grandma_store', 'Negocio de abuela', 'partner', 0.20, 20, true)
on conflict (code) do update
set
  name = excluded.name,
  source_type = excluded.source_type,
  seller_share_rate = excluded.seller_share_rate,
  priority = excluded.priority,
  active = excluded.active;

insert into public.variant_offers (
  variant_id,
  source_id,
  availability_mode,
  sale_price,
  stock_quantity,
  priority,
  lead_time_min_hours,
  lead_time_max_hours,
  active
)
select
  variant.id,
  source.id,
  'finite',
  coalesce(variant.price_override, product.base_price),
  greatest(coalesce(variant.stock, 0), 0),
  source.priority,
  0,
  0,
  true
from public.product_variants variant
join public.products product on product.id = variant.product_id
cross join public.inventory_sources source
where source.code = 'own'
  and variant.active = true
on conflict (variant_id, source_id) where active = true do nothing;

update public.order_items
set
  source_code = coalesce(source_code, 'legacy_own'),
  source_name = coalesce(source_name, 'Stock propio anterior'),
  availability_mode = coalesce(availability_mode, 'finite'),
  seller_share_rate = coalesce(seller_share_rate, 1),
  line_subtotal = coalesce(line_subtotal, unit_price * quantity),
  net_amount = coalesce(net_amount, unit_price * quantity),
  seller_share = coalesce(seller_share, unit_price * quantity),
  partner_share = 0,
  procurement_status = 'not_required'
where source_code is null;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'pending',
      'paid',
      'payment_review',
      'ready_for_pickup',
      'shipped',
      'delivered',
      'cancelled'
    )
  );

create or replace function public.reserve_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  item_record record;
  offer_record record;
  current_stock integer;
begin
  select id, status, stock_reserved
    into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if order_record.status <> 'pending' then
    raise exception 'La orden no esta pendiente';
  end if;

  if order_record.stock_reserved then
    return true;
  end if;

  for item_record in
    select
      offer_id,
      min(variant_id::text)::uuid as variant_id,
      sum(quantity)::integer as quantity,
      min(unit_price) as unit_price,
      max(unit_price) as max_unit_price
    from public.order_items
    where order_id = p_order_id
      and offer_id is not null
    group by offer_id
    order by offer_id
  loop
    select id, variant_id, availability_mode, sale_price, stock_quantity, active
      into offer_record
    from public.variant_offers
    where id = item_record.offer_id
    for update;

    if not found or not offer_record.active then
      raise exception 'Una oferta del pedido ya no esta disponible';
    end if;

    if offer_record.variant_id <> item_record.variant_id
      or item_record.unit_price <> item_record.max_unit_price
      or offer_record.sale_price <> item_record.unit_price
    then
      raise exception 'El precio de una variante cambio. Revisa el carrito';
    end if;

    if offer_record.availability_mode = 'finite' then
      if offer_record.stock_quantity < item_record.quantity then
        raise exception 'Stock insuficiente para una variante del pedido';
      end if;

      update public.variant_offers
      set
        stock_quantity = stock_quantity - item_record.quantity,
        updated_at = now()
      where id = item_record.offer_id;

      update public.product_variants variant
      set stock = coalesce((
        select sum(offer.stock_quantity)::integer
        from public.variant_offers offer
        where offer.variant_id = variant.id
          and offer.active = true
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
    select stock
      into current_stock
    from public.product_variants
    where id = item_record.variant_id
      and active = true
    for update;

    if not found or current_stock < item_record.quantity then
      raise exception 'Stock insuficiente para una variante del pedido';
    end if;

    update public.product_variants
    set stock = stock - item_record.quantity
    where id = item_record.variant_id;
  end loop;

  update public.orders
  set stock_reserved = true, stock_restored = false
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.release_order_stock(
  p_order_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  item_record record;
  offer_variant_id uuid;
begin
  select stock_reserved, stock_restored, coupon_code, coupon_counted
    into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if order_record.stock_reserved and not order_record.stock_restored then
    for item_record in
      select offer_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id and offer_id is not null
      group by offer_id
      order by offer_id
    loop
      update public.variant_offers
      set stock_quantity = stock_quantity + item_record.quantity, updated_at = now()
      where id = item_record.offer_id
        and availability_mode = 'finite'
      returning variant_id into offer_variant_id;

      if offer_variant_id is not null then
        update public.product_variants variant
        set stock = coalesce((
          select sum(offer.stock_quantity)::integer
          from public.variant_offers offer
          where offer.variant_id = variant.id
            and offer.active = true
            and offer.availability_mode = 'finite'
        ), 0)
        where variant.id = offer_variant_id;
      end if;

      offer_variant_id := null;
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
      update public.product_variants
      set stock = stock + item_record.quantity
      where id = item_record.variant_id;
    end loop;
  end if;

  insert into public.partner_ledger_entries (
    source_id,
    order_id,
    order_item_id,
    entry_type,
    amount,
    description
  )
  select
    sale.source_id,
    sale.order_id,
    sale.order_item_id,
    'reversal',
    -abs(sale.amount),
    coalesce(p_reason, 'Pedido cancelado o reembolsado')
  from public.partner_ledger_entries sale
  where sale.order_id = p_order_id
    and sale.entry_type = 'sale'
  on conflict (order_item_id, entry_type)
    where order_item_id is not null and entry_type in ('sale', 'reversal')
  do nothing;

  update public.order_items
  set procurement_status = 'cancelled'
  where order_id = p_order_id
    and procurement_status <> 'not_required';

  if order_record.coupon_counted and order_record.coupon_code is not null then
    update public.coupons
    set used_count = greatest(used_count - 1, 0)
    where upper(code) = upper(order_record.coupon_code);
  end if;

  update public.orders
  set
    stock_reserved = false,
    stock_restored = true,
    coupon_counted = false,
    cancel_reason = coalesce(p_reason, cancel_reason)
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.apply_order_payment(
  p_order_id uuid,
  p_payment_id text,
  p_payment_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  next_status text;
begin
  select status, stock_reserved, stock_restored
    into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  next_status := order_record.status;

  if p_payment_status = 'approved' then
    if order_record.status in ('pending', 'payment_review') and order_record.stock_reserved then
      next_status := 'paid';
    elsif order_record.status in ('pending', 'payment_review') and not order_record.stock_reserved then
      next_status := 'payment_review';
    elsif order_record.status = 'cancelled' and not order_record.stock_reserved then
      begin
        update public.orders
        set status = 'pending', stock_restored = false, cancel_reason = null
        where id = p_order_id;

        perform public.reserve_order_stock(p_order_id);
        next_status := 'paid';
      exception when others then
        next_status := 'payment_review';
      end;
    elsif order_record.status = 'cancelled' then
      next_status := 'payment_review';
    end if;
  elsif p_payment_status in ('rejected', 'cancelled') then
    if order_record.status in ('pending', 'payment_review') then
      perform public.cancel_order_and_release(
        p_order_id,
        'Pago rechazado o cancelado',
        false
      );
      next_status := 'cancelled';
    end if;
  elsif p_payment_status in ('refunded', 'charged_back') then
    if order_record.status in ('pending', 'paid', 'payment_review', 'ready_for_pickup', 'shipped', 'delivered') then
      perform public.cancel_order_and_release(
        p_order_id,
        'Pago devuelto o desconocido',
        false
      );
      next_status := 'cancelled';
    end if;
  end if;

  update public.orders
  set mercadopago_id = p_payment_id, mercadopago_status = p_payment_status, status = next_status
  where id = p_order_id;

  if next_status = 'paid' then
    update public.order_items
    set procurement_status = 'pending_collection'
    where order_id = p_order_id
      and procurement_status = 'awaiting_payment';
  end if;

  return next_status;
end;
$$;

create or replace function public.mark_order_item_collected(p_order_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record record;
begin
  select
    item.id,
    item.order_id,
    item.source_id,
    item.partner_share,
    item.procurement_status,
    orders.status as order_status
  into item_record
  from public.order_items item
  join public.orders orders on orders.id = item.order_id
  where item.id = p_order_item_id
  for update of item;

  if not found then
    raise exception 'Item de pedido no encontrado';
  end if;

  if item_record.order_status not in ('paid', 'ready_for_pickup', 'shipped', 'delivered') then
    raise exception 'El pedido todavia no esta cobrado';
  end if;

  if item_record.procurement_status = 'collected' then
    return true;
  end if;

  if item_record.procurement_status <> 'pending_collection'
    or item_record.source_id is null
    or item_record.partner_share <= 0
  then
    raise exception 'La prenda no requiere retiro del negocio';
  end if;

  update public.order_items
  set procurement_status = 'collected', procurement_collected_at = now()
  where id = p_order_item_id;

  insert into public.partner_ledger_entries (
    source_id,
    order_id,
    order_item_id,
    entry_type,
    amount,
    description
  )
  values (
    item_record.source_id,
    item_record.order_id,
    item_record.id,
    'sale',
    item_record.partner_share,
    'Prenda retirada del negocio'
  )
  on conflict (order_item_id, entry_type)
    where order_item_id is not null and entry_type in ('sale', 'reversal')
  do nothing;

  return true;
end;
$$;

create or replace function public.create_partner_settlement(
  p_source_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_settlement_id uuid;
  settlement_total numeric(10,2);
begin
  perform 1
  from public.partner_ledger_entries
  where source_id = p_source_id and settlement_id is null
  order by created_at, id
  for update;

  select coalesce(sum(amount), 0)
    into settlement_total
  from public.partner_ledger_entries
  where source_id = p_source_id and settlement_id is null;

  if settlement_total <= 0 then
    raise exception 'No hay saldo positivo pendiente para liquidar';
  end if;

  insert into public.partner_settlements (source_id, total_amount, notes)
  values (p_source_id, settlement_total, nullif(btrim(p_notes), ''))
  returning id into new_settlement_id;

  update public.partner_ledger_entries
  set settlement_id = new_settlement_id
  where source_id = p_source_id and partner_ledger_entries.settlement_id is null;

  return new_settlement_id;
end;
$$;

revoke execute on function public.reserve_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_order_stock(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_order_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mark_order_item_collected(uuid) from public, anon, authenticated;
revoke execute on function public.create_partner_settlement(uuid, text) from public, anon, authenticated;

grant execute on function public.reserve_order_stock(uuid) to service_role;
grant execute on function public.release_order_stock(uuid, text) to service_role;
grant execute on function public.apply_order_payment(uuid, text, text) to service_role;
grant execute on function public.mark_order_item_collected(uuid) to service_role;
grant execute on function public.create_partner_settlement(uuid, text) to service_role;
