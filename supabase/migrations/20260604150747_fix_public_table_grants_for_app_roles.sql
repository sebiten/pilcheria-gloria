grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select on table
  public.categories,
  public.products,
  public.product_images,
  public.product_variants,
  public.coupons,
  public.store_settings
  to anon, authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.addresses,
  public.orders,
  public.order_items,
  public.cart_items
  to authenticated;

grant insert on table
  public.orders,
  public.order_items
  to anon;
