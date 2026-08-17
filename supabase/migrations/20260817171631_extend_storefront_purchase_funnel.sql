alter table public.storefront_analytics_events
  drop constraint if exists storefront_analytics_events_event_name_check;

alter table public.storefront_analytics_events
  add constraint storefront_analytics_events_event_name_check check (
    event_name in (
      'page_view',
      'product_view',
      'select_design',
      'select_size',
      'add_to_cart',
      'buy_now',
      'checkout_view',
      'checkout_submit',
      'select_school',
      'catalog_search',
      'whatsapp_click',
      'purchase'
    )
  );

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
    bool_or(event.event_name = 'select_size') as selected_size,
    bool_or(event.event_name = 'add_to_cart') as added_to_cart,
    bool_or(event.event_name = 'buy_now') as used_buy_now,
    bool_or(event.event_name in ('add_to_cart', 'buy_now')) as purchase_intent,
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
    count(distinct event.session_id) filter (where event.event_name = 'select_size') as size_selections,
    count(distinct event.session_id) filter (where event.event_name in ('add_to_cart', 'buy_now')) as purchase_intents,
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
    count(distinct event.session_id) filter (where event.event_name = 'select_size') as size_selections,
    count(distinct event.session_id) filter (where event.event_name in ('add_to_cart', 'buy_now')) as purchase_intents,
    count(distinct event.session_id) filter (where event.event_name = 'add_to_cart') as cart_adds
  from events as event
  join public.products as product on product.id = event.product_id
  where event.event_name in ('product_view', 'select_size', 'add_to_cart', 'buy_now')
  group by event.product_id, product.name, product.slug
  order by views desc, purchase_intents desc, size_selections desc, product.name asc
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
    'size_selection_sessions', coalesce((select count(*) from session_flags where selected_size), 0),
    'purchase_intent_sessions', coalesce((select count(*) from session_flags where purchase_intent), 0),
    'buy_now_sessions', coalesce((select count(*) from session_flags where used_buy_now), 0),
    'cart_sessions', coalesce((select count(*) from session_flags where added_to_cart), 0),
    'checkout_sessions', coalesce((select count(*) from session_flags where viewed_checkout), 0),
    'checkout_submits', coalesce((select count(*) from session_flags where submitted_checkout), 0),
    'purchasing_sessions', coalesce((select count(*) from session_flags where purchased), 0),
    'paid_orders', coalesce((select count(*) from paid_orders), 0),
    'revenue', coalesce((select sum(total) from paid_orders), 0),
    'product_without_cart', coalesce((select count(*) from session_flags where viewed_product and not purchase_intent), 0),
    'cart_without_checkout', coalesce((select count(*) from session_flags where purchase_intent and not viewed_checkout), 0),
    'checkout_without_purchase', coalesce((select count(*) from session_flags where viewed_checkout and not purchased), 0),
    'whatsapp_sessions', coalesce((select count(distinct session_id) from events where event_name = 'whatsapp_click'), 0)
  ),
  'daily', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'date', days.day,
        'visitors', coalesce(daily_events.visitors, 0),
        'product_viewers', coalesce(daily_events.product_viewers, 0),
        'size_selections', coalesce(daily_events.size_selections, 0),
        'purchase_intents', coalesce(daily_events.purchase_intents, 0),
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
    select jsonb_agg(
      to_jsonb(top_products)
      order by top_products.views desc, top_products.purchase_intents desc
    )
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

revoke all on function public.get_storefront_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.get_storefront_analytics(integer)
  to service_role;
