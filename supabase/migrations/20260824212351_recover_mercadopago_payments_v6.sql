alter table public.orders
  add column if not exists mercadopago_status_detail text;

alter table public.storefront_analytics_events
  add column if not exists payment_id text;

alter table public.storefront_analytics_events
  drop constraint if exists storefront_analytics_events_event_name_check,
  drop constraint if exists storefront_analytics_events_event_detail_check,
  drop constraint if exists storefront_analytics_events_payment_id_check;

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
      'payment_rejected',
      'payment_pending',
      'confirmation_view',
      'select_school',
      'catalog_search',
      'whatsapp_click',
      'purchase'
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
    or (
      event_name in ('payment_rejected', 'payment_pending')
      and char_length(event_detail) between 1 and 100
      and event_detail ~ '^[a-z0-9_]+$'
    )
  ),
  add constraint storefront_analytics_events_payment_id_check check (
    payment_id is null
    or (
      event_name in ('payment_rejected', 'payment_pending')
      and char_length(payment_id) between 1 and 64
      and payment_id ~ '^[a-zA-Z0-9-]+$'
    )
  );

create unique index if not exists storefront_analytics_payment_state_uidx
  on public.storefront_analytics_events (event_name, payment_id)
  where event_name in ('payment_rejected', 'payment_pending')
    and payment_id is not null;

drop function if exists public.apply_order_payment(uuid, text, text);

create function public.apply_order_payment(
  p_order_id uuid,
  p_payment_id text,
  p_payment_status text,
  p_payment_status_detail text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record record;
  next_status text;
  first_event record;
  analytics_event_name text;
  item_count smallint;
begin
  select
    status,
    stock_reserved,
    stock_restored,
    analytics_session_id,
    reservation_expires_at
  into order_record
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  next_status := order_record.status;

  if p_payment_status = 'approved' then
    if order_record.status in ('pending', 'payment_review') and order_record.stock_reserved then
      next_status := 'paid';
    elsif order_record.status in ('pending', 'payment_review') and not order_record.stock_reserved then
      next_status := 'payment_review';
    elsif order_record.status = 'cancelled' and not order_record.stock_reserved then
      begin
        update public.orders
        set status = 'pending', stock_restored = false, cancel_reason = null
        where id = p_order_id;

        perform public.reserve_order_stock(p_order_id);
        next_status := 'paid';
      exception when others then
        next_status := 'payment_review';
      end;
    elsif order_record.status = 'cancelled' then
      next_status := 'payment_review';
    end if;
  elsif p_payment_status in ('rejected', 'cancelled') then
    if order_record.status in ('pending', 'payment_review') then
      perform public.cancel_order_and_release(
        p_order_id,
        'Pago rechazado o cancelado',
        false
      );
      next_status := 'cancelled';
    end if;
    analytics_event_name := 'payment_rejected';
  elsif p_payment_status in ('pending', 'in_process') then
    if order_record.status = 'pending' then
      update public.orders
      set reservation_expires_at = greatest(
        coalesce(reservation_expires_at, now()),
        now() + interval '24 hours'
      )
      where id = p_order_id;
    end if;
    analytics_event_name := 'payment_pending';
  elsif p_payment_status in ('refunded', 'charged_back') then
    if order_record.status in ('pending', 'paid', 'payment_review', 'ready_for_pickup', 'shipped', 'delivered') then
      perform public.cancel_order_and_release(
        p_order_id,
        'Pago devuelto o desconocido',
        false
      );
      next_status := 'cancelled';
    end if;
  end if;

  update public.orders
  set
    mercadopago_id = case
      when order_record.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
        and p_payment_status <> 'approved'
      then mercadopago_id
      else p_payment_id
    end,
    mercadopago_status = case
      when order_record.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
        and p_payment_status <> 'approved'
      then mercadopago_status
      else p_payment_status
    end,
    mercadopago_status_detail = case
      when order_record.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
        and p_payment_status <> 'approved'
      then mercadopago_status_detail
      else nullif(btrim(p_payment_status_detail), '')
    end,
    status = next_status
  where id = p_order_id;

  if next_status = 'paid' then
    update public.order_items
    set procurement_status = 'pending_collection'
    where order_id = p_order_id
      and procurement_status = 'awaiting_payment';
  end if;

  if analytics_event_name is not null
     and order_record.analytics_session_id is not null then
    select
      event.source,
      event.device_type,
      event.analytics_version,
      event.campaign,
      event.medium,
      event.content
    into first_event
    from public.storefront_analytics_events as event
    where event.session_id = order_record.analytics_session_id
    order by event.created_at asc
    limit 1;

    select least(20, greatest(1, coalesce(sum(item.quantity), 1)))::smallint
    into item_count
    from public.order_items as item
    where item.order_id = p_order_id;

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
      medium,
      content,
      event_detail,
      payment_id,
      created_at
    ) values (
      order_record.analytics_session_id,
      analytics_event_name,
      '/order-confirmation',
      coalesce(first_event.source, 'direct'),
      coalesce(first_event.device_type, 'mobile'),
      item_count,
      p_order_id,
      coalesce(first_event.analytics_version, 6),
      first_event.campaign,
      first_event.medium,
      first_event.content,
      nullif(btrim(p_payment_status_detail), ''),
      p_payment_id,
      now()
    )
    on conflict (event_name, payment_id)
      where event_name in ('payment_rejected', 'payment_pending')
        and payment_id is not null
      do nothing;
  end if;

  return next_status;
end;
$$;

revoke all on function public.apply_order_payment(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_order_payment(uuid, text, text, text)
  to service_role;

comment on column public.orders.mercadopago_status_detail is
  'Motivo técnico informado por Mercado Pago para el último estado del pago.';
comment on column public.storefront_analytics_events.payment_id is
  'Identificador técnico usado únicamente para deduplicar estados de pago.';

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
    and event.analytics_version >= 6
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
    bool_or(event.event_name = 'payment_rejected') as payment_rejected,
    bool_or(event.event_name = 'payment_pending') as payment_pending,
    bool_or(event.event_name = 'confirmation_view') as viewed_confirmation,
    bool_or(event.event_name = 'purchase') as purchased,
    (array_agg(event.source order by event.created_at asc))[1] as source,
    (array_agg(event.device_type order by event.created_at asc))[1] as device_type
  from events as event
  group by event.session_id
),
paid_orders as (
  select orders.id, orders.total, orders.created_at
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
  select paid_orders.created_at::date as day, coalesce(sum(paid_orders.total), 0) as revenue
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
  select event.school_id, count(distinct event.session_id) as selections
  from events as event
  where event.event_name = 'select_school' and event.school_id is not null
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
checkout_error_stats as (
  select event.event_detail as detail, count(distinct event.session_id) as sessions
  from events as event
  where event.event_name = 'checkout_validation_error' and event.event_detail is not null
  group by event.event_detail
  order by sessions desc, event.event_detail asc
),
rejection_reason_stats as (
  select
    case
      when event.event_detail in (
        'cc_rejected_bad_filled_card_number',
        'cc_rejected_bad_filled_date',
        'cc_rejected_bad_filled_other',
        'cc_rejected_bad_filled_security_code'
      ) then 'data'
      when event.event_detail in (
        'cc_rejected_call_for_authorize',
        'cc_rejected_card_disabled',
        'cc_rejected_duplicated_payment',
        'cc_rejected_insufficient_amount',
        'cc_rejected_invalid_installments',
        'cc_rejected_max_attempts'
      ) then 'issuer'
      when event.event_detail in (
        'cc_rejected_blacklist',
        'cc_rejected_high_risk',
        'cc_rejected_other_reason'
      ) then 'risk'
      else 'other'
    end as category,
    coalesce(event.event_detail, 'unknown') as detail,
    count(distinct event.payment_id) as payments,
    count(distinct event.session_id) as sessions
  from events as event
  where event.event_name = 'payment_rejected'
  group by category, coalesce(event.event_detail, 'unknown')
  order by payments desc, detail asc
)
select jsonb_build_object(
  'period_days', (select days from params),
  'tracking_started_at', (select min(created_at) from public.storefront_analytics_events),
  'comparable_started_at', (
    select min(created_at) from public.storefront_analytics_events where analytics_version >= 6
  ),
  'last_event_at', (select max(created_at) from public.storefront_analytics_events),
  'comparable_sessions', coalesce((select count(*) from session_flags where viewed_catalog), 0),
  'sample_warning', (
    coalesce((select count(*) from session_flags where viewed_product), 0) < 100
    and coalesce((select max(created_at) - min(created_at) from events), interval '0') < interval '30 days'
  ),
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
    'payment_rejected_sessions', coalesce((select count(*) from session_flags where payment_rejected), 0),
    'payment_pending_sessions', coalesce((select count(*) from session_flags where payment_pending), 0),
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
    select jsonb_agg(jsonb_build_object(
      'date', days.day,
      'visitors', coalesce(daily_events.visitors, 0),
      'product_viewers', coalesce(daily_events.product_viewers, 0),
      'size_selections', coalesce(daily_events.size_selections, 0),
      'purchase_intents', coalesce(daily_events.purchase_intents, 0),
      'carts', coalesce(daily_events.carts, 0),
      'checkouts', coalesce(daily_events.checkouts, 0),
      'purchases', coalesce(daily_events.purchases, 0),
      'revenue', coalesce(daily_orders.revenue, 0)
    ) order by days.day)
    from days
    left join daily_events on daily_events.day = days.day
    left join daily_orders on daily_orders.day = days.day
  ), '[]'::jsonb),
  'top_products', coalesce((select jsonb_agg(to_jsonb(top_products) order by views desc, purchase_intents desc) from top_products), '[]'::jsonb),
  'top_schools', coalesce((select jsonb_agg(to_jsonb(top_schools) order by selections desc) from top_schools), '[]'::jsonb),
  'sources', coalesce((select jsonb_agg(to_jsonb(source_stats) order by sessions desc) from source_stats), '[]'::jsonb),
  'devices', coalesce((select jsonb_agg(to_jsonb(device_stats) order by sessions desc) from device_stats), '[]'::jsonb),
  'checkout_errors', coalesce((select jsonb_agg(to_jsonb(checkout_error_stats) order by sessions desc) from checkout_error_stats), '[]'::jsonb),
  'payment_rejection_reasons', coalesce((select jsonb_agg(to_jsonb(rejection_reason_stats) order by payments desc) from rejection_reason_stats), '[]'::jsonb)
);
$$;

revoke all on function public.get_storefront_analytics(integer)
  from public, anon, authenticated;
grant execute on function public.get_storefront_analytics(integer)
  to service_role;

create or replace function public.get_marketing_attribution(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select date_trunc('day', now())
    - (greatest(1, least(coalesce(p_days, 30), 365)) - 1) * interval '1 day' as start_at
),
events as (
  select event.*
  from public.storefront_analytics_events as event
  cross join params
  where event.created_at >= params.start_at and event.analytics_version >= 6
),
session_flags as (
  select
    event.session_id,
    bool_or(event.event_name = 'catalog_view') as viewed_catalog,
    bool_or(event.event_name = 'product_view') as viewed_product,
    bool_or(event.event_name = 'select_size') as selected_size,
    bool_or(event.event_name in ('add_to_cart', 'buy_now')) as purchase_intent,
    bool_or(event.event_name = 'checkout_view') as viewed_checkout,
    bool_or(event.event_name = 'payment_redirect') as redirected_to_payment,
    bool_or(event.event_name = 'payment_approved') as payment_approved,
    (array_agg(event.campaign order by event.created_at asc) filter (where event.campaign is not null))[1] as campaign,
    (array_agg(event.medium order by event.created_at asc) filter (where event.medium is not null))[1] as medium,
    (array_agg(event.content order by event.created_at asc) filter (where event.content is not null))[1] as content
  from events as event
  group by event.session_id
),
paid_by_session as (
  select orders.analytics_session_id as session_id, sum(orders.total) as revenue
  from public.orders as orders
  cross join params
  where orders.created_at >= params.start_at
    and orders.analytics_session_id is not null
    and orders.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
  group by orders.analytics_session_id
),
campaign_stats as (
  select
    session_flags.campaign,
    session_flags.medium,
    session_flags.content,
    count(*) filter (where viewed_catalog) as catalog_sessions,
    count(*) filter (where viewed_product) as product_viewers,
    count(*) filter (where selected_size) as size_selections,
    count(*) filter (where purchase_intent) as purchase_intents,
    count(*) filter (where viewed_checkout) as checkout_sessions,
    count(*) filter (where redirected_to_payment) as payment_redirects,
    count(*) filter (where payment_approved) as payment_approved,
    coalesce(sum(paid_by_session.revenue), 0) as revenue
  from session_flags
  left join paid_by_session using (session_id)
  where session_flags.campaign is not null
  group by session_flags.campaign, session_flags.medium, session_flags.content
  order by catalog_sessions desc, purchase_intents desc, session_flags.campaign asc
  limit 40
)
select coalesce(jsonb_agg(to_jsonb(campaign_stats) order by catalog_sessions desc, purchase_intents desc), '[]'::jsonb)
from campaign_stats;
$$;

revoke all on function public.get_marketing_attribution(integer)
  from public, anon, authenticated;
grant execute on function public.get_marketing_attribution(integer)
  to service_role;
