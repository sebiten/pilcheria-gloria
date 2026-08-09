alter table public.orders
  add column if not exists refund_status text not null default 'none',
  add column if not exists refunded_amount numeric(10,2) not null default 0;

alter table public.orders
  drop constraint if exists orders_refund_status_check,
  drop constraint if exists orders_refunded_amount_check;

alter table public.orders
  add constraint orders_refund_status_check
    check (refund_status in ('none', 'pending', 'partial', 'refunded')),
  add constraint orders_refunded_amount_check
    check (refunded_amount >= 0);

alter table public.order_items
  drop constraint if exists order_items_procurement_status_check;

alter table public.order_items
  add constraint order_items_procurement_status_check check (
    procurement_status in (
      'not_required',
      'awaiting_payment',
      'pending_collection',
      'collected',
      'unavailable',
      'cancelled'
    )
  );

create table if not exists public.manual_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  method text not null default 'bank_transfer',
  status text not null default 'pending',
  amount numeric(10,2) not null,
  transfer_reference text,
  notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint manual_refunds_method_check check (method = 'bank_transfer'),
  constraint manual_refunds_status_check check (status in ('pending', 'paid', 'cancelled')),
  constraint manual_refunds_amount_check check (amount > 0),
  constraint manual_refunds_paid_check check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid' and paid_at is null)
  )
);

create unique index if not exists manual_refunds_active_item_unique
  on public.manual_refunds (order_item_id)
  where status in ('pending', 'paid');

create index if not exists manual_refunds_pending_created_idx
  on public.manual_refunds (created_at, id)
  where status = 'pending';

create index if not exists manual_refunds_order_id_idx
  on public.manual_refunds (order_id);

alter table public.manual_refunds enable row level security;

revoke all on table public.manual_refunds from public, anon, authenticated;
grant select, insert, update, delete on table public.manual_refunds to service_role;

create or replace function public.create_manual_transfer_refund(
  p_order_item_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record record;
  existing_refund_id uuid;
  new_refund_id uuid;
begin
  select id into existing_refund_id
  from public.manual_refunds
  where order_item_id = p_order_item_id
    and status in ('pending', 'paid')
  limit 1;

  if existing_refund_id is not null then
    return existing_refund_id;
  end if;

  select
    item.id,
    item.order_id,
    item.source_code,
    item.availability_mode,
    item.procurement_status,
    item.net_amount,
    orders.status as order_status
  into item_record
  from public.order_items item
  join public.orders orders on orders.id = item.order_id
  where item.id = p_order_item_id
  for update of item, orders;

  if not found then
    raise exception 'Item de pedido no encontrado';
  end if;

  if item_record.source_code <> 'grandma_store'
    or item_record.availability_mode <> 'on_demand'
    or item_record.procurement_status <> 'pending_collection'
  then
    raise exception 'La prenda no admite una devolucion manual por faltante';
  end if;

  if item_record.order_status not in ('paid', 'ready_for_pickup', 'shipped', 'delivered') then
    raise exception 'El pedido todavia no esta cobrado';
  end if;

  if coalesce(item_record.net_amount, 0) <= 0 then
    raise exception 'El importe a devolver no es valido';
  end if;

  update public.order_items
  set procurement_status = 'unavailable'
  where id = p_order_item_id;

  insert into public.manual_refunds (
    order_id,
    order_item_id,
    amount,
    notes
  )
  values (
    item_record.order_id,
    item_record.id,
    item_record.net_amount,
    nullif(btrim(p_notes), '')
  )
  returning id into new_refund_id;

  update public.orders
  set refund_status = 'pending'
  where id = item_record.order_id;

  return new_refund_id;
end;
$$;

create or replace function public.complete_manual_transfer_refund(
  p_refund_id uuid,
  p_transfer_reference text,
  p_notes text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund_record record;
  paid_total numeric(10,2);
  order_total numeric(10,2);
  has_pending boolean;
begin
  if nullif(btrim(p_transfer_reference), '') is null then
    raise exception 'Ingresa la referencia de la transferencia';
  end if;

  select id, order_id, status
  into refund_record
  from public.manual_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Devolucion no encontrada';
  end if;

  if refund_record.status = 'paid' then
    return true;
  end if;

  if refund_record.status <> 'pending' then
    raise exception 'La devolucion ya no esta pendiente';
  end if;

  update public.manual_refunds
  set
    status = 'paid',
    transfer_reference = btrim(p_transfer_reference),
    notes = coalesce(nullif(btrim(p_notes), ''), notes),
    paid_at = now()
  where id = p_refund_id;

  select coalesce(sum(amount), 0)
  into paid_total
  from public.manual_refunds
  where order_id = refund_record.order_id
    and status = 'paid';

  select total
  into order_total
  from public.orders
  where id = refund_record.order_id
  for update;

  select exists (
    select 1
    from public.manual_refunds
    where order_id = refund_record.order_id
      and status = 'pending'
  ) into has_pending;

  update public.orders
  set
    refunded_amount = paid_total,
    refund_status = case
      when has_pending then 'pending'
      when paid_total >= order_total then 'refunded'
      else 'partial'
    end
  where id = refund_record.order_id;

  return true;
end;
$$;

revoke execute on function public.create_manual_transfer_refund(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.complete_manual_transfer_refund(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.create_manual_transfer_refund(uuid, text)
  to service_role;
grant execute on function public.complete_manual_transfer_refund(uuid, text, text)
  to service_role;

-- Todos los stocks existentes de remeras y chombas son propios y se venden a $20.000.
update public.products
set base_price = 20000
where lower(name) like '%remera%'
   or lower(name) like '%chomba%';

update public.product_variants variant
set price_override = 20000
from public.products product
where product.id = variant.product_id
  and (
    lower(product.name) like '%remera%'
    or lower(product.name) like '%chomba%'
  );

update public.variant_offers offer
set sale_price = 20000, updated_at = now()
from public.product_variants variant,
  public.products product,
  public.inventory_sources source
where offer.variant_id = variant.id
  and product.id = variant.product_id
  and source.id = offer.source_id
  and source.code = 'own'
  and (
    lower(product.name) like '%remera%'
    or lower(product.name) like '%chomba%'
  );

-- Normaliza los talles que ya indicaban nivel sin alterar sus cantidades.
update public.product_variants variant
set
  size = btrim(split_part(variant.size, '·', 1)),
  size_system = case
    when variant.size ilike '%secundaria%' and variant.size not ilike '%primaria%'
      then 'adult'
    else 'infant'
  end
from public.products product
where product.id = variant.product_id
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal')
  and variant.size like '%·%';

-- Resuelve los únicos talle 4 heredados que no tenían escala cargada.
update public.product_variants variant
set size_system = case
  when product.slug = 'chomba-escuela-311' then 'infant'
  else 'adult'
end
from public.products product
where product.id = variant.product_id
  and variant.size_system is null
  and btrim(variant.size) = '4'
  and product.slug in (
    'chomba-bachillerato-7-calilegua',
    'chomba-escuela-comercial-6',
    'chomba-escuela-artes-lola-mora',
    'chomba-escuela-311',
    'remera-bachillerato-7-calilegua',
    'remera-escuela-artes-lola-mora'
  );

do $$
declare
  product_row record;
  price_row record;
  target_variant_id uuid;
  own_source_id uuid;
  partner_source_id uuid;
  uniform_color text;
  price_group text;
begin
  select id into own_source_id
  from public.inventory_sources
  where code = 'own';

  select id into partner_source_id
  from public.inventory_sources
  where code = 'grandma_store';

  if own_source_id is null or partner_source_id is null then
    raise exception 'Faltan los origenes de inventario';
  end if;

  for product_row in
    select id, name, slug
    from public.products
    where active = true
      and (lower(name) like '%remera%' or lower(name) like '%chomba%')
    order by id
  loop
    select color into uniform_color
    from public.product_variants
    where product_id = product_row.id and color is not null
    order by stock desc, id
    limit 1;

    price_group := case
      when product_row.slug = 'remera-escuela-comercial-4' then 'remera_comercial_4'
      when product_row.slug = 'remera-escuela-normal' then 'remera_normal'
      when product_row.slug like 'remera-%' then 'remera_general'
      when product_row.slug = 'chomba-etha-segunda-seleccion' then 'chomba_etha'
      when product_row.slug = 'chomba-escuela-normal' then 'chomba_normal'
      else 'chomba_general'
    end;

    for price_row in
      select prices.size_system, prices.size, prices.sale_price
      from (values
        ('remera_general', 'infant', '4', 24500::numeric),
        ('remera_general', 'infant', '6', 24500::numeric),
        ('remera_general', 'infant', '8', 24500::numeric),
        ('remera_general', 'infant', '10', 24500::numeric),
        ('remera_general', 'infant', '12', 26000::numeric),
        ('remera_general', 'infant', '14', 26000::numeric),
        ('remera_general', 'infant', '16', 26000::numeric),
        ('remera_general', 'adult', '1', 27000::numeric),
        ('remera_general', 'adult', '2', 27000::numeric),
        ('remera_general', 'adult', '3', 27000::numeric),
        ('remera_general', 'adult', '4', 27000::numeric),
        ('remera_general', 'adult', '5', 28000::numeric),
        ('remera_general', 'adult', '6', 28000::numeric),
        ('remera_comercial_4', 'infant', '12', 27000::numeric),
        ('remera_comercial_4', 'infant', '14', 27000::numeric),
        ('remera_comercial_4', 'infant', '16', 27000::numeric),
        ('remera_comercial_4', 'adult', '1', 28000::numeric),
        ('remera_comercial_4', 'adult', '2', 28000::numeric),
        ('remera_comercial_4', 'adult', '3', 28000::numeric),
        ('remera_comercial_4', 'adult', '4', 28000::numeric),
        ('remera_comercial_4', 'adult', '5', 29000::numeric),
        ('remera_comercial_4', 'adult', '6', 29000::numeric),
        ('remera_normal', 'infant', '4', 28000::numeric),
        ('remera_normal', 'infant', '6', 28000::numeric),
        ('remera_normal', 'infant', '8', 28000::numeric),
        ('remera_normal', 'infant', '10', 28000::numeric),
        ('remera_normal', 'infant', '12', 29000::numeric),
        ('remera_normal', 'infant', '14', 29000::numeric),
        ('remera_normal', 'infant', '16', 29000::numeric),
        ('remera_normal', 'adult', '1', 30500::numeric),
        ('remera_normal', 'adult', '2', 30500::numeric),
        ('remera_normal', 'adult', '3', 30500::numeric),
        ('remera_normal', 'adult', '4', 30500::numeric),
        ('chomba_general', 'infant', '4', 28500::numeric),
        ('chomba_general', 'infant', '6', 28500::numeric),
        ('chomba_general', 'infant', '8', 28500::numeric),
        ('chomba_general', 'infant', '10', 28500::numeric),
        ('chomba_general', 'infant', '12', 29000::numeric),
        ('chomba_general', 'infant', '14', 29000::numeric),
        ('chomba_general', 'infant', '16', 29000::numeric),
        ('chomba_general', 'adult', '1', 31000::numeric),
        ('chomba_general', 'adult', '2', 31000::numeric),
        ('chomba_general', 'adult', '3', 31000::numeric),
        ('chomba_general', 'adult', '4', 31000::numeric),
        ('chomba_general', 'adult', '5', 32000::numeric),
        ('chomba_general', 'adult', '6', 32000::numeric),
        ('chomba_etha', 'infant', '12', 32500::numeric),
        ('chomba_etha', 'infant', '14', 32500::numeric),
        ('chomba_etha', 'infant', '16', 32500::numeric),
        ('chomba_etha', 'adult', '1', 34000::numeric),
        ('chomba_etha', 'adult', '2', 34000::numeric),
        ('chomba_etha', 'adult', '3', 34000::numeric),
        ('chomba_etha', 'adult', '4', 34000::numeric),
        ('chomba_etha', 'adult', '5', 35000::numeric),
        ('chomba_etha', 'adult', '6', 35000::numeric),
        ('chomba_normal', 'infant', '4', 30000::numeric),
        ('chomba_normal', 'infant', '6', 30000::numeric),
        ('chomba_normal', 'infant', '8', 30000::numeric),
        ('chomba_normal', 'infant', '10', 30000::numeric),
        ('chomba_normal', 'infant', '12', 31500::numeric),
        ('chomba_normal', 'infant', '14', 31500::numeric),
        ('chomba_normal', 'infant', '16', 31500::numeric),
        ('chomba_normal', 'adult', '1', 32500::numeric),
        ('chomba_normal', 'adult', '2', 32500::numeric),
        ('chomba_normal', 'adult', '3', 32500::numeric),
        ('chomba_normal', 'adult', '4', 32500::numeric)
      ) prices(group_code, size_system, size, sale_price)
      where prices.group_code = price_group
    loop
      select id into target_variant_id
      from public.product_variants
      where product_id = product_row.id
        and size_system = price_row.size_system
        and size = price_row.size
        and coalesce(color, '') = coalesce(uniform_color, '')
      limit 1;

      if target_variant_id is null then
        insert into public.product_variants (
          product_id,
          size,
          size_system,
          color,
          price_override,
          stock,
          active
        )
        values (
          product_row.id,
          price_row.size,
          price_row.size_system,
          uniform_color,
          20000,
          0,
          true
        )
        returning id into target_variant_id;
      else
        update public.product_variants
        set price_override = 20000, active = true
        where id = target_variant_id;
      end if;

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
        target_variant_id,
        own_source_id,
        'finite',
        20000,
        greatest(coalesce(variant.stock, 0), 0),
        10,
        0,
        0,
        true
      from public.product_variants variant
      where variant.id = target_variant_id
      on conflict (variant_id, source_id) where active = true
      do update set
        sale_price = 20000,
        priority = 10,
        updated_at = now();

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
      values (
        target_variant_id,
        partner_source_id,
        'on_demand',
        price_row.sale_price,
        null,
        20,
        24,
        48,
        true
      )
      on conflict (variant_id, source_id) where active = true
      do update set
        availability_mode = excluded.availability_mode,
        sale_price = excluded.sale_price,
        stock_quantity = excluded.stock_quantity,
        priority = excluded.priority,
        lead_time_min_hours = excluded.lead_time_min_hours,
        lead_time_max_hours = excluded.lead_time_max_hours,
        updated_at = now();

      update public.product_variants variant
      set stock = coalesce((
        select sum(offer.stock_quantity)::integer
        from public.variant_offers offer
        join public.inventory_sources source on source.id = offer.source_id
        where offer.variant_id = variant.id
          and offer.active = true
          and offer.availability_mode = 'finite'
          and source.code = 'own'
      ), 0)
      where variant.id = target_variant_id;

      target_variant_id := null;
    end loop;
  end loop;
end;
$$;
