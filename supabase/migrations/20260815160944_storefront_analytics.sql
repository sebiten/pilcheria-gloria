create table if not exists public.storefront_analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_name text not null check (
    event_name in (
      'page_view',
      'product_view',
      'add_to_cart',
      'checkout_view',
      'checkout_submit',
      'select_school',
      'catalog_search',
      'whatsapp_click',
      'purchase'
    )
  ),
  path text not null check (char_length(path) between 1 and 200),
  product_id uuid references public.products(id) on delete set null,
  school_id text check (school_id is null or char_length(school_id) <= 80),
  source text not null default 'direct' check (
    source in ('direct', 'whatsapp', 'facebook', 'instagram', 'google', 'other')
  ),
  device_type text not null check (
    device_type in ('mobile', 'tablet', 'desktop')
  ),
  quantity smallint check (quantity is null or quantity between 1 and 20),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists analytics_session_id uuid;

create index if not exists storefront_analytics_events_created_at_idx
  on public.storefront_analytics_events (created_at desc);

create index if not exists storefront_analytics_events_event_created_idx
  on public.storefront_analytics_events (event_name, created_at desc);

create index if not exists storefront_analytics_events_session_created_idx
  on public.storefront_analytics_events (session_id, created_at desc);

create index if not exists storefront_analytics_events_product_created_idx
  on public.storefront_analytics_events (product_id, created_at desc)
  where product_id is not null;

create index if not exists storefront_analytics_events_school_created_idx
  on public.storefront_analytics_events (school_id, created_at desc)
  where school_id is not null;

create unique index if not exists storefront_analytics_purchase_order_uidx
  on public.storefront_analytics_events (order_id)
  where event_name = 'purchase' and order_id is not null;

create index if not exists orders_analytics_session_id_idx
  on public.orders (analytics_session_id)
  where analytics_session_id is not null;

alter table public.storefront_analytics_events enable row level security;

revoke all on table public.storefront_analytics_events from public, anon, authenticated;
grant select, insert, update, delete on table public.storefront_analytics_events to service_role;

comment on table public.storefront_analytics_events is
  'Eventos anonimos y minimizados del embudo de la tienda. Sin IP, email, telefono ni texto libre.';

create or replace function private.capture_paid_order_analytics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  first_source text;
  first_device text;
  item_count smallint;
begin
  if new.analytics_session_id is null
     or new.status not in ('paid', 'ready_for_pickup', 'shipped', 'delivered') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select event.source, event.device_type
    into first_source, first_device
  from public.storefront_analytics_events as event
  where event.session_id = new.analytics_session_id
  order by event.created_at asc
  limit 1;

  select least(20, greatest(1, coalesce(sum(item.quantity), 1)))::smallint
    into item_count
  from public.order_items as item
  where item.order_id = new.id;

  insert into public.storefront_analytics_events (
    session_id,
    event_name,
    path,
    source,
    device_type,
    quantity,
    order_id,
    created_at
  ) values (
    new.analytics_session_id,
    'purchase',
    '/checkout',
    coalesce(first_source, 'direct'),
    coalesce(first_device, 'mobile'),
    item_count,
    new.id,
    now()
  )
  on conflict (order_id)
    where event_name = 'purchase' and order_id is not null
    do nothing;

  return new;
end;
$$;

drop trigger if exists capture_paid_order_analytics_trigger on public.orders;
create trigger capture_paid_order_analytics_trigger
after insert or update of status on public.orders
for each row execute function private.capture_paid_order_analytics();

revoke all on function private.capture_paid_order_analytics() from public, anon, authenticated;

create or replace function public.get_storefront_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select
    greatest(1, least(coalesce(p_days, 30), 365)) as days,
    date_trunc('day', now())
      - (greatest(1, least(coalesce(p_days, 30), 365)) - 1) * interval '1 day' as start_at
),
events as (
  select event.*
  from public.storefront_analytics_events as event
  cross join params
  where event.created_at >= params.start_at
),
session_flags as (
  select
    event.session_id,
    bool_or(event.event_name = 'page_view') as visited,
    bool_or(event.event_name = 'product_view') as viewed_product,
    bool_or(event.event_name = 'add_to_cart') as added_to_cart,
    bool_or(event.event_name = 'checkout_view') as viewed_checkout,
    bool_or(event.event_name = 'checkout_submit') as submitted_checkout,
    bool_or(event.event_name = 'purchase') as purchased,
    (array_agg(event.source order by event.created_at asc))[1] as source,
    (array_agg(event.device_type order by event.created_at asc))[1] as device_type
  from events as event
  group by event.session_id
),
paid_orders as (
  select orders.id, orders.total, orders.created_at, orders.analytics_session_id
  from public.orders
  cross join params
  where orders.created_at >= params.start_at
    and orders.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
),
days as (
  select generate_series(
    (select start_at::date from params),
    current_date,
    interval '1 day'
  )::date as day
),
daily_events as (
  select
    event.created_at::date as day,
    count(distinct event.session_id) filter (where event.event_name = 'page_view') as visitors,
    count(distinct event.session_id) filter (where event.event_name = 'product_view') as product_viewers,
    count(distinct event.session_id) filter (where event.event_name = 'add_to_cart') as carts,
    count(distinct event.session_id) filter (where event.event_name = 'checkout_view') as checkouts
  from events as event
  group by event.created_at::date
),
daily_orders as (
  select
    paid_orders.created_at::date as day,
    count(*) as purchases,
    coalesce(sum(paid_orders.total), 0) as revenue
  from paid_orders
  group by paid_orders.created_at::date
),
top_products as (
  select
    event.product_id,
    product.name,
    product.slug,
    count(distinct event.session_id) filter (where event.event_name = 'product_view') as views,
    count(distinct event.session_id) filter (where event.event_name = 'add_to_cart') as cart_adds
  from events as event
  join public.products as product on product.id = event.product_id
  where event.event_name in ('product_view', 'add_to_cart')
  group by event.product_id, product.name, product.slug
  order by views desc, cart_adds desc, product.name asc
  limit 10
),
top_schools as (
  select
    event.school_id,
    count(distinct event.session_id) as selections
  from events as event
  where event.event_name = 'select_school'
    and event.school_id is not null
  group by event.school_id
  order by selections desc, event.school_id asc
  limit 10
),
source_stats as (
  select session_flags.source, count(*) as sessions
  from session_flags
  where session_flags.visited
  group by session_flags.source
  order by sessions desc
),
device_stats as (
  select session_flags.device_type, count(*) as sessions
  from session_flags
  where session_flags.visited
  group by session_flags.device_type
  order by sessions desc
)
select jsonb_build_object(
  'period_days', (select days from params),
  'tracking_started_at', (select min(created_at) from public.storefront_analytics_events),
  'last_event_at', (select max(created_at) from public.storefront_analytics_events),
  'metrics', jsonb_build_object(
    'visitors', coalesce((select count(*) from session_flags where visited), 0),
    'page_views', coalesce((select count(*) from events where event_name = 'page_view'), 0),
    'product_viewers', coalesce((select count(*) from session_flags where viewed_product), 0),
    'cart_sessions', coalesce((select count(*) from session_flags where added_to_cart), 0),
    'checkout_sessions', coalesce((select count(*) from session_flags where viewed_checkout), 0),
    'checkout_submits', coalesce((select count(*) from session_flags where submitted_checkout), 0),
    'purchasing_sessions', coalesce((select count(*) from session_flags where purchased), 0),
    'paid_orders', coalesce((select count(*) from paid_orders), 0),
    'revenue', coalesce((select sum(total) from paid_orders), 0),
    'product_without_cart', coalesce((select count(*) from session_flags where viewed_product and not added_to_cart), 0),
    'cart_without_checkout', coalesce((select count(*) from session_flags where added_to_cart and not viewed_checkout), 0),
    'checkout_without_purchase', coalesce((select count(*) from session_flags where viewed_checkout and not purchased), 0),
    'whatsapp_sessions', coalesce((select count(distinct session_id) from events where event_name = 'whatsapp_click'), 0)
  ),
  'daily', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', days.day,
        'visitors', coalesce(daily_events.visitors, 0),
        'product_viewers', coalesce(daily_events.product_viewers, 0),
        'carts', coalesce(daily_events.carts, 0),
        'checkouts', coalesce(daily_events.checkouts, 0),
        'purchases', coalesce(daily_orders.purchases, 0),
        'revenue', coalesce(daily_orders.revenue, 0)
      ) order by days.day
    )
    from days
    left join daily_events on daily_events.day = days.day
    left join daily_orders on daily_orders.day = days.day
  ), '[]'::jsonb),
  'top_products', coalesce((
    select jsonb_agg(to_jsonb(top_products) order by top_products.views desc, top_products.cart_adds desc)
    from top_products
  ), '[]'::jsonb),
  'top_schools', coalesce((
    select jsonb_agg(to_jsonb(top_schools) order by top_schools.selections desc)
    from top_schools
  ), '[]'::jsonb),
  'sources', coalesce((
    select jsonb_agg(to_jsonb(source_stats) order by source_stats.sessions desc)
    from source_stats
  ), '[]'::jsonb),
  'devices', coalesce((
    select jsonb_agg(to_jsonb(device_stats) order by device_stats.sessions desc)
    from device_stats
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_storefront_analytics(integer) from public, anon, authenticated;
grant execute on function public.get_storefront_analytics(integer) to service_role;
