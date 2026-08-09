update public.product_variants variant
set size_system = 'infant'
from public.products product
join public.categories category on category.id = product.category_id
where variant.product_id = product.id
  and variant.size_system is null
  and btrim(variant.size) in ('8', '10', '12', '14', '16')
  and category.slug = 'uniformes-escolares';

update public.product_variants variant
set size_system = 'adult'
from public.products product
join public.categories category on category.id = product.category_id
where variant.product_id = product.id
  and variant.size_system is null
  and btrim(variant.size) in ('1', '2', '3', '5', '6')
  and category.slug = 'uniformes-escolares';
