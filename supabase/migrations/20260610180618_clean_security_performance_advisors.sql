create index if not exists addresses_clerk_user_id_idx on public.addresses (clerk_user_id);
create index if not exists addresses_profile_id_idx on public.addresses (profile_id);
create index if not exists cart_items_product_id_idx on public.cart_items (product_id);
create index if not exists cart_items_variant_id_idx on public.cart_items (variant_id);
create index if not exists categories_parent_id_idx on public.categories (parent_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_variant_id_idx on public.order_items (variant_id);
create index if not exists orders_clerk_user_id_idx on public.orders (clerk_user_id);
create index if not exists orders_profile_id_idx on public.orders (profile_id);
create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists product_variants_product_id_idx on public.product_variants (product_id);
create index if not exists products_category_id_idx on public.products (category_id);

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public';
    execute 'revoke execute on function public.handle_new_user() from anon';
    execute 'revoke execute on function public.handle_new_user() from authenticated';
    execute 'alter function public.handle_new_user() set search_path = public, auth';
  end if;
end
$$;

alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (clerk_user_id = (select auth.uid())::text);
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (clerk_user_id = (select auth.uid())::text)
  with check (clerk_user_id = (select auth.uid())::text);

drop policy if exists "Users can read own addresses" on public.addresses;
drop policy if exists "Users can insert own addresses" on public.addresses;
drop policy if exists "Users can update own addresses" on public.addresses;
drop policy if exists "Users can delete own addresses" on public.addresses;
create policy "Users can read own addresses"
  on public.addresses for select
  to authenticated
  using (clerk_user_id = (select auth.uid())::text);
create policy "Users can insert own addresses"
  on public.addresses for insert
  to authenticated
  with check (clerk_user_id = (select auth.uid())::text);
create policy "Users can update own addresses"
  on public.addresses for update
  to authenticated
  using (clerk_user_id = (select auth.uid())::text)
  with check (clerk_user_id = (select auth.uid())::text);
create policy "Users can delete own addresses"
  on public.addresses for delete
  to authenticated
  using (clerk_user_id = (select auth.uid())::text);

drop policy if exists "Users can read own cart" on public.cart_items;
drop policy if exists "Users can insert own cart" on public.cart_items;
drop policy if exists "Users can update own cart" on public.cart_items;
drop policy if exists "Users can delete own cart" on public.cart_items;
create policy "Users can read own cart"
  on public.cart_items for select
  to authenticated
  using (clerk_user_id = (select auth.uid())::text);
create policy "Users can insert own cart"
  on public.cart_items for insert
  to authenticated
  with check (clerk_user_id = (select auth.uid())::text);
create policy "Users can update own cart"
  on public.cart_items for update
  to authenticated
  using (clerk_user_id = (select auth.uid())::text)
  with check (clerk_user_id = (select auth.uid())::text);
create policy "Users can delete own cart"
  on public.cart_items for delete
  to authenticated
  using (clerk_user_id = (select auth.uid())::text);

drop policy if exists "Admins can manage all orders" on public.orders;
drop policy if exists "Users can read own orders" on public.orders;
drop policy if exists "Users can insert own orders" on public.orders;
drop policy if exists "Users and admins can read orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
drop policy if exists "Admins can delete orders" on public.orders;
create policy "Users and admins can read orders"
  on public.orders for select
  to authenticated
  using (
    clerk_user_id = (select auth.uid())::text
    or exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );
create policy "Users can insert own orders"
  on public.orders for insert
  to authenticated
  with check (clerk_user_id = (select auth.uid())::text);
create policy "Admins can update orders"
  on public.orders for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );
create policy "Admins can delete orders"
  on public.orders for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );

alter table public.order_items enable row level security;
drop policy if exists "Users and admins can read order items" on public.order_items;
create policy "Users and admins can read order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (
          orders.clerk_user_id = (select auth.uid())::text
          or exists (
            select 1 from public.profiles
            where profiles.clerk_user_id = (select auth.uid())::text
              and profiles.role = 'admin'
          )
        )
    )
  );

alter table public.coupons enable row level security;
drop policy if exists "Admins can manage coupons" on public.coupons;
create policy "Admins can manage coupons"
  on public.coupons for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );

drop policy if exists "Admins can manage store settings" on public.store_settings;
drop policy if exists "Public can read store settings" on public.store_settings;
drop policy if exists "Admins can insert store settings" on public.store_settings;
drop policy if exists "Admins can update store settings" on public.store_settings;
drop policy if exists "Admins can delete store settings" on public.store_settings;
create policy "Public can read store settings"
  on public.store_settings for select
  to anon, authenticated
  using (true);
create policy "Admins can insert store settings"
  on public.store_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );
create policy "Admins can update store settings"
  on public.store_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );
create policy "Admins can delete store settings"
  on public.store_settings for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.uid())::text
        and profiles.role = 'admin'
    )
  );

drop policy if exists "Public can read product images" on storage.objects;
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;
create policy "Authenticated users can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');
create policy "Authenticated users can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');
