alter table public.product_variants
  add column if not exists school_level text;

alter table public.product_variants
  drop constraint if exists product_variants_school_level_check;

alter table public.product_variants
  add constraint product_variants_school_level_check
  check (school_level is null or school_level in ('primary', 'secondary'));

drop index if exists public.product_variants_product_apparel_unique;

create unique index product_variants_product_apparel_unique
  on public.product_variants (
    product_id,
    lower(coalesce(school_level, 'no-design')),
    lower(coalesce(size_system, 'legacy')),
    lower(coalesce(size, '')),
    lower(coalesce(color, ''))
  )
  where size is not null;

-- Recupera el diseño que todavía está identificado en los SKU propios.
update public.product_variants variant
set
  school_level = case
    when variant.sku ilike '%-SECUNDARIA' then 'secondary'
    when variant.sku ilike '%-PRIMARIA' then 'primary'
    else variant.school_level
  end,
  size_system = case
    when variant.size in ('8', '10', '12', '14', '16') then 'infant'
    when variant.size in ('1', '2', '3', '4', '5') then 'adult'
    else variant.size_system
  end
from public.products product
where product.id = variant.product_id
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal')
  and variant.sku is not null
  and variant.sku not ilike '%PRIMARIA-Y-SECUNDARIA%'
  and (
    variant.sku ilike '%-PRIMARIA'
    or variant.sku ilike '%-SECUNDARIA'
  );

-- Las prendas que estaban combinadas se retiran del catálogo legado. Más
-- abajo se distribuyen con el conteo físico confirmado, sin duplicarlas.
update public.product_variants variant
set active = false
from public.products product
where product.id = variant.product_id
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal')
  and (
    variant.school_level is null
    or variant.size not in ('1', '2', '3', '4', '5', '8', '10', '12', '14', '16')
  );

update public.variant_offers offer
set active = false, updated_at = now()
from public.product_variants variant,
  public.products product,
  public.inventory_sources source
where offer.variant_id = variant.id
  and product.id = variant.product_id
  and source.id = offer.source_id
  and source.code = 'grandma_store'
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal');

-- El talle 4 propio de la Escuela 311 había quedado clasificado como infantil.
-- Con la escala confirmada, se mueve al talle adulto 4 sin duplicar unidades.
do $$
declare
  old_variant record;
  target_variant_id uuid;
  own_source_id uuid;
  old_stock integer;
begin
  select id into own_source_id
  from public.inventory_sources
  where code = 'own';

  select variant.id, variant.product_id, variant.color
  into old_variant
  from public.product_variants variant
  join public.products product on product.id = variant.product_id
  where product.slug = 'chomba-escuela-311'
    and variant.size_system = 'infant'
    and variant.size = '4'
  limit 1;

  if old_variant.id is not null then
    select id into target_variant_id
    from public.product_variants
    where product_id = old_variant.product_id
      and size_system = 'adult'
      and size = '4'
      and school_level is null
      and coalesce(color, '') = coalesce(old_variant.color, '')
    limit 1;

    select coalesce(stock_quantity, 0)
    into old_stock
    from public.variant_offers
    where variant_id = old_variant.id
      and source_id = own_source_id
      and active = true
    limit 1;

    if target_variant_id is not null and coalesce(old_stock, 0) > 0 then
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
        own_source_id,
        'finite',
        20000,
        old_stock,
        10,
        0,
        0,
        true
      )
      on conflict (variant_id, source_id) where active = true
      do update set
        stock_quantity = public.variant_offers.stock_quantity + excluded.stock_quantity,
        sale_price = 20000,
        updated_at = now();

      update public.variant_offers
      set active = false, updated_at = now()
      where variant_id = old_variant.id
        and source_id = own_source_id
        and active = true;

      update public.product_variants
      set stock = 0, active = false
      where id = old_variant.id;

      update public.product_variants
      set stock = coalesce((
        select sum(offer.stock_quantity)::integer
        from public.variant_offers offer
        where offer.variant_id = target_variant_id
          and offer.source_id = own_source_id
          and offer.active = true
      ), 0)
      where id = target_variant_id;
    end if;
  end if;
end;
$$;

do $$
declare
  product_row record;
  option_row record;
  target_variant_id uuid;
  own_source_id uuid;
  partner_source_id uuid;
  uniform_color text;
  partner_price numeric(10,2);
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
    select id, slug
    from public.products
    where active = true
      and slug in ('remera-escuela-normal', 'chomba-escuela-normal')
    order by id
  loop
    select color into uniform_color
    from public.product_variants
    where product_id = product_row.id and color is not null
    order by stock desc, id
    limit 1;

    for option_row in
      select *
      from (values
        ('primary', 'infant', '8'),
        ('primary', 'infant', '10'),
        ('primary', 'infant', '12'),
        ('primary', 'infant', '14'),
        ('primary', 'infant', '16'),
        ('primary', 'adult', '1'),
        ('primary', 'adult', '2'),
        ('primary', 'adult', '3'),
        ('primary', 'adult', '4'),
        ('primary', 'adult', '5'),
        ('secondary', 'infant', '8'),
        ('secondary', 'infant', '10'),
        ('secondary', 'infant', '12'),
        ('secondary', 'infant', '14'),
        ('secondary', 'infant', '16'),
        ('secondary', 'adult', '1'),
        ('secondary', 'adult', '2'),
        ('secondary', 'adult', '3'),
        ('secondary', 'adult', '4'),
        ('secondary', 'adult', '5')
      ) options(school_level, size_system, size)
    loop
      select id into target_variant_id
      from public.product_variants
      where product_id = product_row.id
        and school_level = option_row.school_level
        and size_system = option_row.size_system
        and size = option_row.size
        and coalesce(color, '') = coalesce(uniform_color, '')
      limit 1;

      if target_variant_id is null then
        insert into public.product_variants (
          product_id,
          size,
          size_system,
          school_level,
          color,
          price_override,
          stock,
          active
        )
        values (
          product_row.id,
          option_row.size,
          option_row.size_system,
          option_row.school_level,
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
      do update set sale_price = 20000, priority = 10, updated_at = now();

      partner_price := case
        when option_row.size = '5' then null
        when product_row.slug = 'remera-escuela-normal'
          and option_row.size_system = 'infant'
          and option_row.size in ('8', '10') then 28000
        when product_row.slug = 'remera-escuela-normal'
          and option_row.size_system = 'infant' then 29000
        when product_row.slug = 'remera-escuela-normal'
          and option_row.size_system = 'adult' then 30500
        when product_row.slug = 'chomba-escuela-normal'
          and option_row.size_system = 'infant'
          and option_row.size in ('8', '10') then 30000
        when product_row.slug = 'chomba-escuela-normal'
          and option_row.size_system = 'infant' then 31500
        when product_row.slug = 'chomba-escuela-normal'
          and option_row.size_system = 'adult' then 32500
        else null
      end;

      if partner_price is not null then
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
          partner_price,
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
      end if;

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
      partner_price := null;
    end loop;
  end loop;
end;
$$;

-- Conteo físico confirmado del stock propio de Escuela Normal.
-- Todo se mantiene a $20.000; solamente cambia la asignación de diseño.
update public.variant_offers offer
set
  stock_quantity = case
    -- Remeras de Primaria
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'adult'
      and variant.size = '1' then 6
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'adult'
      and variant.size = '2' then 16
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'adult'
      and variant.size = '4' then 4
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '8' then 21
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '10' then 12
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '12' then 10
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '14' then 8
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '16' then 26
    -- Remeras de Secundaria
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'secondary'
      and variant.size_system = 'adult'
      and variant.size = '3' then 3
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'secondary'
      and variant.size_system = 'adult'
      and variant.size = '4' then 8
    when product.slug = 'remera-escuela-normal'
      and variant.school_level = 'secondary'
      and variant.size_system = 'adult'
      and variant.size = '5' then 10
    -- Chombas de Primaria
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'adult'
      and variant.size = '1' then 16
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '8' then 3
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '12' then 20
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '14' then 22
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'primary'
      and variant.size_system = 'infant'
      and variant.size = '16' then 12
    -- Chombas de Secundaria
    when product.slug = 'chomba-escuela-normal'
      and variant.school_level = 'secondary'
      and variant.size_system = 'infant'
      and variant.size = '12' then 6
    else 0
  end,
  sale_price = 20000,
  updated_at = now()
from public.product_variants variant,
  public.products product,
  public.inventory_sources source
where offer.variant_id = variant.id
  and product.id = variant.product_id
  and source.id = offer.source_id
  and source.code = 'own'
  and offer.active = true
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal')
  and variant.school_level is not null
  and variant.size in ('1', '2', '3', '4', '5', '8', '10', '12', '14', '16');

-- Elimina de la disponibilidad los pools anteriores ya distribuidos.
update public.variant_offers offer
set active = false, updated_at = now()
from public.product_variants variant,
  public.products product,
  public.inventory_sources source
where offer.variant_id = variant.id
  and product.id = variant.product_id
  and source.id = offer.source_id
  and source.code = 'own'
  and offer.active = true
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal')
  and variant.school_level is null;

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
from public.products product
where product.id = variant.product_id
  and product.slug in ('remera-escuela-normal', 'chomba-escuela-normal');

-- La tienda muestra únicamente las escalas confirmadas: Juvenil 8–16 y
-- Adulto 1–5. Los stocks heredados fuera de escala se conservan internamente.
update public.product_variants variant
set active = false
from public.products product
where product.id = variant.product_id
  and (lower(product.name) like '%remera%' or lower(product.name) like '%chomba%')
  and (
    (variant.size_system = 'infant' and variant.size not in ('8', '10', '12', '14', '16'))
    or (variant.size_system = 'adult' and variant.size not in ('1', '2', '3', '4', '5'))
  );

update public.variant_offers offer
set active = false, updated_at = now()
from public.product_variants variant,
  public.products product,
  public.inventory_sources source
where offer.variant_id = variant.id
  and product.id = variant.product_id
  and source.id = offer.source_id
  and source.code = 'grandma_store'
  and (lower(product.name) like '%remera%' or lower(product.name) like '%chomba%')
  and (
    (variant.size_system = 'infant' and variant.size not in ('8', '10', '12', '14', '16'))
    or (variant.size_system = 'adult' and variant.size not in ('1', '2', '3', '4', '5'))
  );
