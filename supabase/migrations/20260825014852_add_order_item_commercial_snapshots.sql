alter table public.order_items
  add column product_name text,
  add column product_slug text,
  add column product_brand text,
  add column variant_size text,
  add column variant_size_system text,
  add column variant_school_level text,
  add column variant_color text,
  add column variant_sku text,
  add column variant_label text;

comment on column public.order_items.product_name is
  'Snapshot inmutable del nombre del producto al crear la orden.';
comment on column public.order_items.product_slug is
  'Snapshot inmutable del slug del producto al crear la orden.';
comment on column public.order_items.product_brand is
  'Snapshot inmutable de la marca del producto al crear la orden.';
comment on column public.order_items.variant_size is
  'Snapshot inmutable del talle de la variante al crear la orden.';
comment on column public.order_items.variant_size_system is
  'Snapshot inmutable del sistema de talle de la variante al crear la orden.';
comment on column public.order_items.variant_school_level is
  'Snapshot inmutable del diseño o nivel escolar de la variante al crear la orden.';
comment on column public.order_items.variant_color is
  'Snapshot inmutable del color de la variante al crear la orden.';
comment on column public.order_items.variant_sku is
  'Snapshot inmutable del SKU de la variante al crear la orden.';
comment on column public.order_items.variant_label is
  'Label comercial inmutable compuesto en PostgreSQL al crear la orden.';

-- No existía otra fuente histórica. Para filas anteriores, el backfill refleja
-- conservadoramente el valor actual de las FKs todavía disponibles.
update public.order_items as item
set
  product_name = coalesce(nullif(btrim(product.name), ''), 'Producto histórico'),
  product_slug = nullif(btrim(product.slug), ''),
  product_brand = nullif(btrim(product.brand), ''),
  variant_size = nullif(btrim(variant.size), ''),
  variant_size_system = nullif(btrim(variant.size_system), ''),
  variant_school_level = nullif(btrim(variant.school_level), ''),
  variant_color = nullif(btrim(variant.color), ''),
  variant_sku = nullif(btrim(variant.sku), ''),
  variant_label = nullif(pg_catalog.concat_ws(
    ' · ',
    case variant.school_level
      when 'primary' then 'Diseño Primaria'
      when 'secondary' then 'Diseño Secundaria'
      else null
    end,
    case
      when nullif(btrim(variant.size), '') is null then null
      else pg_catalog.concat(
        'Talle ',
        case variant.size_system
          when 'infant' then 'Juvenil '
          when 'adult' then 'Adulto '
          else ''
        end,
        btrim(variant.size)
      )
    end,
    nullif(btrim(variant.color), ''),
    case
      when nullif(btrim(variant.sku), '') is null then null
      else pg_catalog.concat('SKU ', btrim(variant.sku))
    end
  ), '')
from public.products as product,
     public.product_variants as variant
where product.id = item.product_id
  and variant.id = item.variant_id
  and variant.product_id = product.id;

update public.order_items
set product_name = 'Producto histórico'
where product_name is null;

alter table public.order_items
  alter column product_name set not null;

create function public.capture_order_item_commercial_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_record record;
begin
  if tg_op = 'UPDATE' then
    if new.product_name is distinct from old.product_name
       or new.product_slug is distinct from old.product_slug
       or new.product_brand is distinct from old.product_brand
       or new.variant_size is distinct from old.variant_size
       or new.variant_size_system is distinct from old.variant_size_system
       or new.variant_school_level is distinct from old.variant_school_level
       or new.variant_color is distinct from old.variant_color
       or new.variant_sku is distinct from old.variant_sku
       or new.variant_label is distinct from old.variant_label then
      raise exception 'Los snapshots comerciales de un item de orden son inmutables';
    end if;

    return new;
  end if;

  select
    product.name as product_name,
    product.slug as product_slug,
    product.brand as product_brand,
    variant.size as variant_size,
    variant.size_system as variant_size_system,
    variant.school_level as variant_school_level,
    variant.color as variant_color,
    variant.sku as variant_sku
  into product_record
  from public.products as product
  join public.product_variants as variant
    on variant.product_id = product.id
  where product.id = new.product_id
    and variant.id = new.variant_id;

  if not found then
    raise exception 'No se pudo resolver la identidad comercial del item de orden';
  end if;

  new.product_name := coalesce(
    nullif(btrim(product_record.product_name), ''),
    'Producto histórico'
  );
  new.product_slug := nullif(btrim(product_record.product_slug), '');
  new.product_brand := nullif(btrim(product_record.product_brand), '');
  new.variant_size := nullif(btrim(product_record.variant_size), '');
  new.variant_size_system := nullif(btrim(product_record.variant_size_system), '');
  new.variant_school_level := nullif(btrim(product_record.variant_school_level), '');
  new.variant_color := nullif(btrim(product_record.variant_color), '');
  new.variant_sku := nullif(btrim(product_record.variant_sku), '');
  new.variant_label := nullif(pg_catalog.concat_ws(
    ' · ',
    case product_record.variant_school_level
      when 'primary' then 'Diseño Primaria'
      when 'secondary' then 'Diseño Secundaria'
      else null
    end,
    case
      when nullif(btrim(product_record.variant_size), '') is null then null
      else pg_catalog.concat(
        'Talle ',
        case product_record.variant_size_system
          when 'infant' then 'Juvenil '
          when 'adult' then 'Adulto '
          else ''
        end,
        btrim(product_record.variant_size)
      )
    end,
    nullif(btrim(product_record.variant_color), ''),
    case
      when nullif(btrim(product_record.variant_sku), '') is null then null
      else pg_catalog.concat('SKU ', btrim(product_record.variant_sku))
    end
  ), '');

  return new;
end;
$$;

create trigger capture_order_item_commercial_snapshot
before insert or update on public.order_items
for each row execute function public.capture_order_item_commercial_snapshot();

revoke all on function public.capture_order_item_commercial_snapshot() from public;

comment on function public.capture_order_item_commercial_snapshot() is
  'Captura desde PostgreSQL la identidad comercial de las filas bloqueadas por create_checkout_order() e impide modificarla después.';
