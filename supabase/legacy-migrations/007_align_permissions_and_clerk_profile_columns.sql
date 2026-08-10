grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

revoke trigger, truncate, references on all tables in schema public
from anon, authenticated;

grant select on table
  public.categories,
  public.products,
  public.product_images,
  public.product_variants,
  public.coupons,
  public.store_settings
to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.cart_items enable row level security;

revoke all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.order_items,
  public.cart_items
from anon, authenticated;

grant all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.order_items,
  public.cart_items
to service_role;

alter table public.addresses alter column profile_id drop not null;
alter table public.cart_items alter column profile_id drop not null;
