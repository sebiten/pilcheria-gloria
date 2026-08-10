-- La aplicacion usa Clerk y accede a Supabase exclusivamente desde el servidor.
grant all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.cart_items,
  public.coupons,
  public.product_reviews
to service_role;

-- Retirar privilegios heredados peligrosos de tablas con datos privados.
revoke all privileges on table
  public.profiles,
  public.addresses,
  public.orders,
  public.cart_items
from public, anon, authenticated;

-- Cupones y resenas se consultan exclusivamente desde el backend.
revoke all privileges on table
  public.coupons,
  public.product_reviews
from public, anon, authenticated;

drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Public can read order items" on public.order_items;
drop policy if exists "Public can read active coupons" on public.coupons;
drop policy if exists "Public can read approved product reviews" on public.product_reviews;
drop policy if exists "Admins can manage coupons" on public.coupons;

-- El bucket sigue siendo publico para servir imagenes, pero solo el backend lo modifica.
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;

create index if not exists withdrawal_requests_order_id_idx
  on public.withdrawal_requests (order_id);

create index if not exists orders_checkout_fingerprint_created_at_idx
  on public.orders ((shipping_address ->> '_checkout_fingerprint'), created_at desc)
  where shipping_address ? '_checkout_fingerprint';

notify pgrst, 'reload schema';
