create index if not exists product_reviews_order_id_idx
  on product_reviews (order_id);

drop policy if exists "Admins can manage product reviews" on product_reviews;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_reviews'
      and policyname = 'Admins can insert product reviews'
  ) then
    create policy "Admins can insert product reviews"
      on product_reviews for insert
      with check (
        exists (
          select 1 from profiles
          where profiles.clerk_user_id = (select auth.uid()::text)
            and profiles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_reviews'
      and policyname = 'Admins can update product reviews'
  ) then
    create policy "Admins can update product reviews"
      on product_reviews for update
      using (
        exists (
          select 1 from profiles
          where profiles.clerk_user_id = (select auth.uid()::text)
            and profiles.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from profiles
          where profiles.clerk_user_id = (select auth.uid()::text)
            and profiles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_reviews'
      and policyname = 'Admins can delete product reviews'
  ) then
    create policy "Admins can delete product reviews"
      on product_reviews for delete
      using (
        exists (
          select 1 from profiles
          where profiles.clerk_user_id = (select auth.uid()::text)
            and profiles.role = 'admin'
        )
      );
  end if;
end $$;
