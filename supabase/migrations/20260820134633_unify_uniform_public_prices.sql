create table if not exists public.uniform_price_groups (
  code text primary key,
  name text not null,
  price numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  constraint uniform_price_groups_code_check check (code in ('remera', 'chomba')),
  constraint uniform_price_groups_price_check check (price > 0)
);

alter table public.uniform_price_groups enable row level security;

revoke all on table public.uniform_price_groups from public, anon, authenticated;
grant select, insert, update, delete on table public.uniform_price_groups to service_role;

insert into public.uniform_price_groups (code, name, price)
values
  ('remera', 'Remeras', 28000),
  ('chomba', 'Chombas', 32000)
on conflict (code) do update
set
  name = excluded.name,
  price = excluded.price,
  updated_at = now();

alter table public.products
  add column if not exists uniform_price_group_code text
  references public.uniform_price_groups(code) on update cascade on delete restrict;

create index if not exists products_uniform_price_group_code_idx
  on public.products (uniform_price_group_code)
  where uniform_price_group_code is not null;

update public.products product
set uniform_price_group_code = case
  when lower(product.name) like 'remera %' then 'remera'
  when lower(product.name) like 'chomba %' then 'chomba'
  else product.uniform_price_group_code
end
from public.categories category
where category.id = product.category_id
  and category.slug = 'uniformes-escolares'
  and product.active = true
  and (
    lower(product.name) like 'remera %'
    or lower(product.name) like 'chomba %'
  );

do $$
begin
  if exists (
    select 1
    from public.products product
    join public.categories category on category.id = product.category_id
    where category.slug = 'uniformes-escolares'
      and product.active = true
      and (
        lower(product.name) like 'remera %'
        or lower(product.name) like 'chomba %'
      )
      and product.uniform_price_group_code is null
  ) then
    raise exception 'Hay uniformes activos sin grupo de precio';
  end if;
end;
$$;

create or replace function public.update_uniform_price_groups(
  p_remera_price numeric,
  p_chomba_price numeric
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_remera_price <= 0 or p_chomba_price <= 0 then
    raise exception 'Los precios deben ser mayores a cero';
  end if;

  update public.uniform_price_groups
  set
    price = case code
      when 'remera' then p_remera_price
      when 'chomba' then p_chomba_price
      else price
    end,
    updated_at = now()
  where code in ('remera', 'chomba');

  update public.products product
  set base_price = price_group.price
  from public.uniform_price_groups price_group
  where product.uniform_price_group_code = price_group.code;

  update public.product_variants variant
  set price_override = price_group.price
  from public.products product
  join public.uniform_price_groups price_group
    on price_group.code = product.uniform_price_group_code
  where variant.product_id = product.id;
end;
$$;

revoke all on function public.update_uniform_price_groups(numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.update_uniform_price_groups(numeric, numeric)
  to service_role;

select public.update_uniform_price_groups(28000, 32000);

do $$
declare
  analytics_function text;
begin
  select pg_get_functiondef(
    'public.get_storefront_analytics(integer)'::regprocedure
  ) into analytics_function;

  if position('analytics_version >= 3' in analytics_function) = 0 then
    raise exception 'No se encontró el corte de analytics v3 esperado';
  end if;

  analytics_function := replace(
    analytics_function,
    'analytics_version >= 3',
    'analytics_version >= 4'
  );

  execute analytics_function;
end;
$$;
