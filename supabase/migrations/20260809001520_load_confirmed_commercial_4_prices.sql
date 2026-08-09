do $$
declare
  target_product_id uuid;
  target_variant_id uuid;
  own_source_id uuid;
  partner_source_id uuid;
  uniform_color text;
  price_row record;
begin
  select id into target_product_id
  from public.products
  where slug = 'remera-escuela-comercial-4';

  if target_product_id is null then
    raise exception 'No se encontro la Remera Escuela Comercial N 4';
  end if;

  select color into uniform_color
  from public.product_variants
  where product_id = target_product_id and color is not null
  order by id
  limit 1;

  select id into own_source_id
  from public.inventory_sources
  where code = 'own';

  select id into partner_source_id
  from public.inventory_sources
  where code = 'grandma_store';

  for price_row in
    select *
    from (values
      ('infant', '12', 27000::numeric),
      ('infant', '14', 27000::numeric),
      ('infant', '16', 27000::numeric),
      ('adult', '1', 28000::numeric),
      ('adult', '2', 28000::numeric),
      ('adult', '3', 28000::numeric),
      ('adult', '4', 28000::numeric),
      ('adult', '5', 29000::numeric),
      ('adult', '6', 29000::numeric)
    ) prices(size_system, size, sale_price)
  loop
    select id into target_variant_id
    from public.product_variants
    where product_id = target_product_id
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
        stock,
        active
      )
      values (
        target_product_id,
        price_row.size,
        price_row.size_system,
        uniform_color,
        0,
        true
      )
      returning id into target_variant_id;
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
      coalesce(variant.price_override, product.base_price),
      coalesce(variant.stock, 0),
      10,
      0,
      0,
      true
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    where variant.id = target_variant_id
    on conflict (variant_id, source_id) where active = true do nothing;

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

    target_variant_id := null;
  end loop;
end
$$;
