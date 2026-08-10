create table if not exists product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  clerk_user_id text not null references profiles(clerk_user_id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  title text,
  comment text not null,
  reviewer_name text,
  approved boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (product_id, clerk_user_id)
);

create index if not exists product_reviews_product_approved_created_idx
  on product_reviews (product_id, approved, created_at desc);

create index if not exists product_reviews_clerk_user_id_idx
  on product_reviews (clerk_user_id);

alter table product_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_reviews'
      and policyname = 'Public can read approved product reviews'
  ) then
    create policy "Public can read approved product reviews"
      on product_reviews for select
      using (approved = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'product_reviews'
      and policyname = 'Admins can manage product reviews'
  ) then
    create policy "Admins can manage product reviews"
      on product_reviews for all
      using (
        exists (
          select 1 from profiles
          where profiles.clerk_user_id = auth.uid()::text
            and profiles.role = 'admin'
        )
      );
  end if;
end $$;

grant select on product_reviews to anon;
grant select on product_reviews to authenticated;
