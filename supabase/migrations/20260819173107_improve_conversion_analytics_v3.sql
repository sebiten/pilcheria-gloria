alter table public.storefront_analytics_events
  add column if not exists analytics_version smallint not null default 1,
  add column if not exists campaign text,
  add column if not exists event_detail text;

alter table public.storefront_analytics_events
  drop constraint if exists storefront_analytics_events_event_name_check,
  drop constraint if exists storefront_analytics_events_analytics_version_check,
  drop constraint if exists storefront_analytics_events_campaign_check,
  drop constraint if exists storefront_analytics_events_event_detail_check;

alter table public.storefront_analytics_events
  add constraint storefront_analytics_events_event_name_check check (
    event_name in (
      'page_view',
      'catalog_view',
      'product_view',
      'select_design',
      'select_size',
      'add_to_cart',
      'buy_now',
      'checkout_view',
      'checkout_cta_click',
      'checkout_validation_error',
      'checkout_submit',
      'payment_redirect',
      'payment_approved',
      'confirmation_view',
      'select_school',
      'catalog_search',
      'whatsapp_click',
      'purchase'
    )
  ),
  add constraint storefront_analytics_events_analytics_version_check check (
    analytics_version between 1 and 32
  ),
  add constraint storefront_analytics_events_campaign_check check (
    campaign is null
    or (
      char_length(campaign) between 1 and 64
      and campaign ~ '^[a-z0-9_-]+$'
    )
  ),
  add constraint storefront_analytics_events_event_detail_check check (
    event_detail is null
    or (
      event_name = 'checkout_validation_error'
      and event_detail in (
        'missing_name',
        'invalid_email',
        'invalid_phone',
        'shipping_unavailable',
        'missing_address',
        'coupon_pending',
        'api_client_error',
        'api_server_error',
        'missing_payment_link'
      )
    )
  );

create index if not exists storefront_analytics_version_created_idx
  on public.storefront_analytics_events (analytics_version, created_at desc);

create index if not exists storefront_analytics_campaign_created_idx
  on public.storefront_analytics_events (campaign, created_at desc)
  where campaign is not null;

create unique index if not exists storefront_analytics_payment_approved_order_uidx
  on public.storefront_analytics_events (order_id)
  where event_name = 'payment_approved' and order_id is not null;

create or replace function private.capture_paid_order_analytics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  first_source text;
  first_device text;
  first_campaign text;
  session_analytics_version smallint;
  item_count smallint;
begin
  if new.analytics_session_id is null then
    return new;
  end if;

  select
    event.source,
    event.device_type,
    event.campaign,
    event.analytics_version
    into first_source, first_device, first_campaign, session_analytics_version
  from public.storefront_analytics_events as event
  where event.session_id = new.analytics_session_id
  order by event.created_at asc
  limit 1;

  select least(20, greatest(1, coalesce(sum(item.quantity), 1)))::smallint
    into item_count
  from public.order_items as item
  where item.order_id = new.id;

  if new.mercadopago_status = 'approved'
     and (
       tg_op = 'INSERT'
       or old.mercadopago_status is distinct from new.mercadopago_status
     ) then
    insert into public.storefront_analytics_events (
      session_id,
      event_name,
      path,
      source,
      device_type,
      quantity,
      order_id,
      analytics_version,
      campaign,
      created_at
    ) values (
      new.analytics_session_id,
      'payment_approved',
      '/checkout',
      coalesce(first_source, 'direct'),
      coalesce(first_device, 'mobile'),
      item_count,
      new.id,
      coalesce(session_analytics_version, 1),
      first_campaign,
      now()
    )
    on conflict (order_id)
      where event_name = 'payment_approved' and order_id is not null
      do nothing;
  end if;

  if new.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
     ) then
    insert into public.storefront_analytics_events (
      session_id,
      event_name,
      path,
      source,
      device_type,
      quantity,
      order_id,
      analytics_version,
      campaign,
      created_at
    ) values (
      new.analytics_session_id,
      'purchase',
      '/checkout',
      coalesce(first_source, 'direct'),
      coalesce(first_device, 'mobile'),
      item_count,
      new.id,
      coalesce(session_analytics_version, 1),
      first_campaign,
      now()
    )
    on conflict (order_id)
      where event_name = 'purchase' and order_id is not null
      do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_paid_order_analytics_trigger on public.orders;
create trigger capture_paid_order_analytics_trigger
after insert or update of status, mercadopago_status on public.orders
for each row execute function private.capture_paid_order_analytics();

revoke all on function private.capture_paid_order_analytics()
  from public, anon, authenticated;

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
    and event.analytics_version >= 3
),
session_flags as (
  select
    event.session_id,
    bool_or(event.event_name = 'page_view') as visited,
    bool_or(event.event_name = 'catalog_view') as viewed_catalog,
    bool_or(event.event_name = 'product_view') as viewed_product,
    bool_or(event.event_name = 'select_size') as selected_size,
    bool_or(event.event_name = 'add_to_cart') as added_to_cart,
    bool_or(event.event_name = 'buy_now') as used_buy_now,
    bool_or(event.event_name in ('add_to_cart', 'buy_now')) as purchase_intent,
    bool_or(event.event_name = 'checkout_view') as viewed_checkout,
    bool_or(event.event_name = 'checkout_cta_click') as clicked_checkout_cta,
    bool_or(event.event_name = 'checkout_submit') as submitted_checkout,
    bool_or(event.event_name = 'payment_redirect') as redirected_to_payment,
    bool_or(event.event_name = 'payment_approved') as payment_approved,
    bool_or(event.event_name = 'confirmation_view') as viewed_confirmation,
    bool_or(event.event_name = 'purchase') as purchased,
    (array_agg(event.source order by event.created_at asc))[1] as source,
    (array_agg(event.device_type order by event.created_at asc))[1] as device_type,
    (array_agg(event.campaign order by event.created_at asc)
      filter (where event.campaign is not null))[1] as campaign
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
    count(distinct event.session_id) filter (where event.event_name = 'catalog_view') as visitors,
    count(distinct event.session_id) filter (where event.event_name = 'product_view') as product_viewers,
    count(distinct event.session_id) filter (where event.event_name = 'select_size') as size_selections,
    count(distinct event.session_id) filter (where event.event_name in ('add_to_cart', 'buy_now')) as purchase_intents,
    count(distinct event.session_id) filter (where event.event_name = 'add_to_cart') as carts,
    count(distinct event.session_id) filter (where event.event_name = 'checkout_view') as checkouts,
    count(distinct event.session_id) filter (where event.event_name = 'payment_approved') as purchases
  from events as event
  group by event.created_at::date
),
daily_orders as (
  select
    paid_orders.created_at::date as day,
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
  where session_flags.viewed_catalog
  group by session_flags.source
  order by sessions desc
),
device_stats as (
  select session_flags.device_type, count(*) as sessions
  from session_flags
  where session_flags.viewed_catalog
  group by session_flags.device_type
  order by sessions desc
),
campaign_stats as (
  select session_flags.campaign, count(*) as sessions
  from session_flags
  where session_flags.viewed_catalog
    and session_flags.campaign is not null
  group by session_flags.campaign
  order by sessions desc, session_flags.campaign asc
  limit 20
),
checkout_error_stats as (
  select
    event.event_detail as detail,
    count(distinct event.session_id) as sessions
  from events as event
  where event.event_name = 'checkout_validation_error'
    and event.event_detail is not null
  group by event.event_detail
  order by sessions desc, event.event_detail asc
)
select jsonb_build_object(
  'period_days', (select days from params),
  'tracking_started_at', (select min(created_at) from public.storefront_analytics_events),
  'comparable_started_at', (
    select min(created_at)
    from public.storefront_analytics_events
    where analytics_version >= 3
  ),
  'last_event_at', (select max(created_at) from public.storefront_analytics_events),
  'comparable_sessions', coalesce((select count(*) from session_flags where viewed_catalog), 0),
  'sample_warning', coalesce((select count(*) from session_flags where viewed_catalog), 0) < 10,
  'metrics', jsonb_build_object(
    'visitors', coalesce((select count(*) from session_flags where visited), 0),
    'catalog_sessions', coalesce((select count(*) from session_flags where viewed_catalog), 0),
    'page_views', coalesce((select count(*) from events where event_name = 'page_view'), 0),
    'product_viewers', coalesce((select count(*) from session_flags where viewed_product), 0),
    'size_selection_sessions', coalesce((select count(*) from session_flags where selected_size), 0),
    'purchase_intent_sessions', coalesce((select count(*) from session_flags where purchase_intent), 0),
    'buy_now_sessions', coalesce((select count(*) from session_flags where used_buy_now), 0),
    'cart_sessions', coalesce((select count(*) from session_flags where added_to_cart), 0),
    'checkout_sessions', coalesce((select count(*) from session_flags where viewed_checkout), 0),
    'checkout_cta_sessions', coalesce((select count(*) from session_flags where clicked_checkout_cta), 0),
    'checkout_submits', coalesce((select count(*) from session_flags where submitted_checkout), 0),
    'payment_redirect_sessions', coalesce((select count(*) from session_flags where redirected_to_payment), 0),
    'payment_approved_sessions', coalesce((select count(*) from session_flags where payment_approved), 0),
    'confirmation_sessions', coalesce((select count(*) from session_flags where viewed_confirmation), 0),
    'purchasing_sessions', coalesce((select count(*) from session_flags where purchased), 0),
    'paid_orders', coalesce((select count(*) from paid_orders), 0),
    'revenue', coalesce((select sum(total) from paid_orders), 0),
    'product_without_cart', coalesce((select count(*) from session_flags where viewed_product and not purchase_intent), 0),
    'cart_without_checkout', coalesce((select count(*) from session_flags where purchase_intent and not viewed_checkout), 0),
    'checkout_without_purchase', coalesce((select count(*) from session_flags where viewed_checkout and not payment_approved), 0),
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
        'purchases', coalesce(daily_events.purchases, 0),
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
  ), '[]'::jsonb),
  'campaigns', coalesce((
    select jsonb_agg(to_jsonb(campaign_stats) order by campaign_stats.sessions desc)
    from campaign_stats
  ), '[]'::jsonb),
  'checkout_errors', coalesce((
    select jsonb_agg(to_jsonb(checkout_error_stats) order by checkout_error_stats.sessions desc)
    from checkout_error_stats
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_storefront_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.get_storefront_analytics(integer)
  to service_role;

alter table public.product_reviews
  alter column clerk_user_id drop not null,
  alter column approved set default false;

create table if not exists public.product_review_invites (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

alter table public.product_reviews
  add column if not exists guest_invite_id uuid
    references public.product_review_invites(id) on delete set null;

create unique index if not exists product_reviews_guest_invite_uidx
  on public.product_reviews (guest_invite_id)
  where guest_invite_id is not null;

create index if not exists product_review_invites_expires_idx
  on public.product_review_invites (expires_at)
  where used_at is null;

alter table public.product_review_invites enable row level security;

revoke all privileges on table public.product_review_invites
  from public, anon, authenticated;
grant select, insert, update, delete on table public.product_review_invites
  to service_role;

comment on table public.product_review_invites is
  'Invitaciones internas de un solo uso para reseñas verificadas de compras invitadas.';
