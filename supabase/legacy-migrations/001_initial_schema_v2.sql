-- Pune Ecommerce - Initial Schema (v2 with Clerk user ID)
-- Run this in Supabase Dashboard > SQL Editor for NEW projects
-- For existing projects, run 003_add_clerk_user_id.sql instead

-- Profiles (uses Clerk user ID as primary key)
create table if not exists profiles (
  id uuid primary key,
  clerk_user_id text unique not null,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamp with time zone default now()
);

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  parent_id uuid references categories(id),
  sort_order int default 0,
  created_at timestamp with time zone default now()
);

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  base_price numeric(10,2) not null,
  category_id uuid references categories(id),
  featured boolean default false,
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- Product Images
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  url text not null,
  alt text,
  sort_order int default 0
);

-- Product Variants (tamaños)
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  width numeric not null,
  length numeric not null,
  price_override numeric(10,2),
  stock int default 0,
  active boolean default true
);

-- Addresses (uses clerk_user_id instead of profile_id)
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references profiles(clerk_user_id) on delete cascade,
  name text not null,
  street text not null,
  city text not null,
  state text not null,
  zip text,
  is_default boolean default false,
  created_at timestamp with time zone default now()
);

-- Orders (uses clerk_user_id)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text references profiles(clerk_user_id),
  status text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  total numeric(10,2) not null,
  shipping_cost numeric(10,2),
  shipping_method text,
  shipping_address jsonb,
  mercadopago_id text,
  mercadopago_status text,
  created_at timestamp with time zone default now()
);

-- Order Items
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  product_id uuid references products(id),
  variant_id uuid references product_variants(id),
  quantity int not null,
  unit_price numeric(10,2) not null
);

-- Coupons
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percentage', 'fixed')),
  value numeric(10,2) not null,
  min_purchase numeric(10,2),
  max_uses int,
  used_count int default 0,
  expires_at timestamp with time zone,
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- Cart Items (uses clerk_user_id)
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null references profiles(clerk_user_id) on delete cascade,
  product_id uuid references products(id) on delete cascade not null,
  variant_id uuid references product_variants(id),
  quantity int not null default 1,
  created_at timestamp with time zone default now()
);

-- RLS Policies (Row Level Security)
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table product_variants enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table coupons enable row level security;
alter table cart_items enable row level security;

-- Profiles: anyone can read, only auth can update own
create policy "Anyone can read profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (clerk_user_id = auth.uid()::text);

-- Categories: public read
create policy "Public can read categories" on categories for select using (true);

-- Products: public read active products
create policy "Public can read active products" on products for select using (active = true);
create policy "Admins can manage products" on products for all using (
  exists (
    select 1 from profiles
    where clerk_user_id = auth.uid()::text
    and role = 'admin'
  )
);

-- Product Images: public read
create policy "Public can read product images" on product_images for select using (true);
create policy "Admins can manage product images" on product_images for all using (
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Product Variants: public read active
create policy "Public can read active variants" on product_variants for select using (active = true);
create policy "Admins can manage variants" on product_variants for all using (
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Addresses: users manage own
create policy "Users can read own addresses" on addresses for select using (clerk_user_id = auth.uid()::text);
create policy "Users can insert own addresses" on addresses for insert with check (clerk_user_id = auth.uid()::text);
create policy "Users can update own addresses" on addresses for update using (clerk_user_id = auth.uid()::text);
create policy "Users can delete own addresses" on addresses for delete using (clerk_user_id = auth.uid()::text);

-- Orders: users manage own
create policy "Users can read own orders" on orders for select using (clerk_user_id = auth.uid()::text);
create policy "Users can insert own orders" on orders for insert with check (clerk_user_id = auth.uid()::text);
create policy "Admins can manage all orders" on orders for all using (
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Order Items: public read, users read own
create policy "Public can read order items" on order_items for select using (true);
create policy "Users can insert order items" on order_items for insert with check (
  exists (select 1 from orders where id = order_id and clerk_user_id = auth.uid()::text)
);
create policy "Admins can manage order items" on order_items for all using (
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Coupons: public read active
create policy "Public can read active coupons" on coupons for select using (active = true);
create policy "Admins can manage coupons" on coupons for all using (
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Cart: users manage own
create policy "Users can read own cart" on cart_items for select using (clerk_user_id = auth.uid()::text);
create policy "Users can insert own cart" on cart_items for insert with check (clerk_user_id = auth.uid()::text);
create policy "Users can update own cart" on cart_items for update using (clerk_user_id = auth.uid()::text);
create policy "Users can delete own cart" on cart_items for delete using (clerk_user_id = auth.uid()::text);

-- Grant permissions to anon for public reads
grant select on categories to anon;
grant select on products to anon;
grant select on product_images to anon;
grant select on product_variants to anon;
grant select on coupons to anon;
grant select on order_items to anon;

-- Storage bucket for product images
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict do nothing;

create policy "Public can read product images" on storage.objects for select using (bucket_id = 'product-images');
create policy "Admins can upload product images" on storage.objects for insert with check (
  bucket_id = 'product-images' and
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);
create policy "Admins can delete product images" on storage.objects for delete using (
  bucket_id = 'product-images' and
  exists (select 1 from profiles where clerk_user_id = auth.uid()::text and role = 'admin')
);

-- Sample data
insert into categories (name, slug, description, image_url, sort_order) values
  ('Colchones', 'colchones', 'Colchones de alta calidad para un descanso perfecto', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800', 1),
  ('Sommiers', 'sommiers', 'Sommiers firmes y resistentes', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', 2),
  ('Almohadas', 'almohadas', 'Almohadas ergonómicas', 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800', 3)
on conflict do nothing;

-- Sample products
insert into products (name, slug, description, base_price, category_id, featured, active)
select 'Colchón Pune Premium', 'colchon-pune-premium', 'Colchón de alta gama con sistema de resortes individually wrapped', 189999.00, id, true, true
from categories where slug = 'colchones'
on conflict do nothing;

insert into products (name, slug, description, base_price, category_id, featured, active)
select 'Sommier Pune Supreme', 'sommier-pune-supreme', 'Sommier Premium con estructura de madera maciza', 289999.00, id, true, true
from categories where slug = 'sommiers'
on conflict do nothing;

-- Sample variants for products
insert into product_variants (product_id, width, length, price_override, stock, active)
select id, 140, 190, null, 10, true from products where slug = 'colchon-pune-premium'
on conflict do nothing;

insert into product_variants (product_id, width, length, price_override, stock, active)
select id, 160, 200, null, 8, true from products where slug = 'colchon-pune-premium'
on conflict do nothing;

insert into product_variants (product_id, width, length, price_override, stock, active)
select id, 140, 190, null, 5, true from products where slug = 'sommier-pune-supreme'
on conflict do nothing;

insert into product_variants (product_id, width, length, price_override, stock, active)
select id, 160, 200, 309999.00, 3, true from products where slug = 'sommier-pune-supreme'
on conflict do nothing;

-- Sample images
insert into product_images (product_id, url, alt, sort_order)
select id, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800', 'Colchón Pune Premium', 1
from products where slug = 'colchon-pune-premium'
on conflict do nothing;

insert into product_images (product_id, url, alt, sort_order)
select id, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800', 'Sommier Pune Supreme', 1
from products where slug = 'sommier-pune-supreme'
on conflict do nothing;

-- Sample coupon
insert into coupons (code, type, value, min_purchase, max_uses, active)
values ('BIENVENIDO10', 'percentage', 10, 50000, 100, true)
on conflict do nothing;

select 'Initial schema v2 applied successfully' as status;