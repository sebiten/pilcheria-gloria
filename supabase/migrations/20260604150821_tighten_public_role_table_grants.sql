revoke trigger, truncate, references on all tables in schema public from anon, authenticated;

grant select on table
  public.categories,
  public.products,
  public.product_images,
  public.product_variants,
  public.coupons,
  public.store_settings
  to anon, authenticated;
