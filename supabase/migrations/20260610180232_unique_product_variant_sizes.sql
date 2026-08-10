with variant_groups as (
  select
    product_id,
    width,
    length,
    (array_agg(id order by coalesce(active, true) desc, coalesce(stock, 0) desc, id))[1] as keeper_id,
    sum(coalesce(stock, 0)) as total_stock,
    bool_or(coalesce(active, true)) as is_active,
    (array_agg(price_override) filter (where price_override is not null))[1] as price_override
  from public.product_variants
  group by product_id, width, length
  having count(*) > 1
),
keepers as (
  select
    product_id,
    width,
    length,
    keeper_id,
    total_stock,
    is_active,
    price_override
  from variant_groups
),
duplicates as (
  select
    variant.id as duplicate_id,
    keeper.keeper_id
  from public.product_variants variant
  join keepers keeper
    on keeper.product_id = variant.product_id
   and keeper.width = variant.width
   and keeper.length = variant.length
  where variant.id <> keeper.keeper_id
)
update public.cart_items cart_item
set variant_id = duplicates.keeper_id
from duplicates
where cart_item.variant_id = duplicates.duplicate_id;

with variant_groups as (
  select
    product_id,
    width,
    length,
    (array_agg(id order by coalesce(active, true) desc, coalesce(stock, 0) desc, id))[1] as keeper_id
  from public.product_variants
  group by product_id, width, length
  having count(*) > 1
),
duplicates as (
  select
    variant.id as duplicate_id,
    variant_groups.keeper_id
  from public.product_variants variant
  join variant_groups
    on variant_groups.product_id = variant.product_id
   and variant_groups.width = variant.width
   and variant_groups.length = variant.length
  where variant.id <> variant_groups.keeper_id
)
update public.order_items order_item
set variant_id = duplicates.keeper_id
from duplicates
where order_item.variant_id = duplicates.duplicate_id;

with variant_groups as (
  select
    product_id,
    width,
    length,
    (array_agg(id order by coalesce(active, true) desc, coalesce(stock, 0) desc, id))[1] as keeper_id,
    sum(coalesce(stock, 0)) as total_stock,
    bool_or(coalesce(active, true)) as is_active,
    (array_agg(price_override) filter (where price_override is not null))[1] as price_override
  from public.product_variants
  group by product_id, width, length
  having count(*) > 1
),
keepers as (
  select
    keeper_id,
    total_stock,
    is_active,
    price_override
  from variant_groups
)
update public.product_variants variant
set
  stock = keepers.total_stock,
  active = keepers.is_active,
  price_override = keepers.price_override
from keepers
where variant.id = keepers.keeper_id;

with variant_groups as (
  select
    product_id,
    width,
    length,
    (array_agg(id order by coalesce(active, true) desc, coalesce(stock, 0) desc, id))[1] as keeper_id
  from public.product_variants
  group by product_id, width, length
  having count(*) > 1
),
duplicates as (
  select variant.id
  from public.product_variants variant
  join variant_groups
    on variant_groups.product_id = variant.product_id
   and variant_groups.width = variant.width
   and variant_groups.length = variant.length
  where variant.id <> variant_groups.keeper_id
)
delete from public.product_variants variant
using duplicates
where variant.id = duplicates.id;

create unique index if not exists product_variants_product_size_unique
  on public.product_variants (product_id, width, length);
