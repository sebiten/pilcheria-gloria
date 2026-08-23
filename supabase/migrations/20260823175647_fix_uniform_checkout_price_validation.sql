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
    select
      offer.id,
      offer.variant_id,
      offer.availability_mode,
      offer.stock_quantity,
      offer.active,
      coalesce(price_group.price, offer.sale_price) as checkout_price
      into offer_record
    from public.variant_offers offer
    join public.product_variants variant on variant.id = offer.variant_id
    join public.products product on product.id = variant.product_id
    left join public.uniform_price_groups price_group
      on price_group.code = product.uniform_price_group_code
    where offer.id = item_record.offer_id
    for update of offer;

    if not found or not offer_record.active then
      raise exception 'Una oferta del pedido ya no esta disponible';
    end if;

    if offer_record.variant_id <> item_record.variant_id
      or item_record.unit_price <> item_record.max_unit_price
      or offer_record.checkout_price <> item_record.unit_price
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

revoke execute on function public.reserve_order_stock(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid)
  to service_role;
