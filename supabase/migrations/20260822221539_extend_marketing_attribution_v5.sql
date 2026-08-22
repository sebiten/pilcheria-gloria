alter table public.storefront_analytics_events
  add column if not exists medium text,
  add column if not exists content text;

alter table public.storefront_analytics_events
  drop constraint if exists storefront_analytics_events_medium_check,
  drop constraint if exists storefront_analytics_events_content_check;

alter table public.storefront_analytics_events
  add constraint storefront_analytics_events_medium_check check (
    medium is null
    or (
      char_length(medium) between 1 and 48
      and medium ~ '^[a-z0-9_-]+$'
    )
  ),
  add constraint storefront_analytics_events_content_check check (
    content is null
    or (
      char_length(content) between 1 and 80
      and content ~ '^[a-z0-9_-]+$'
    )
  );

create index if not exists storefront_analytics_medium_created_idx
  on public.storefront_analytics_events (medium, created_at desc)
  where medium is not null;

create index if not exists storefront_analytics_content_created_idx
  on public.storefront_analytics_events (content, created_at desc)
  where content is not null;

create or replace function public.get_marketing_attribution(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select
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
    bool_or(event.event_name = 'catalog_view') as viewed_catalog,
    bool_or(event.event_name = 'product_view') as viewed_product,
    bool_or(event.event_name = 'select_size') as selected_size,
    bool_or(event.event_name in ('add_to_cart', 'buy_now')) as purchase_intent,
    bool_or(event.event_name = 'checkout_view') as viewed_checkout,
    bool_or(event.event_name = 'payment_redirect') as redirected_to_payment,
    bool_or(event.event_name = 'payment_approved') as payment_approved,
    (array_agg(event.campaign order by event.created_at asc)
      filter (where event.campaign is not null))[1] as campaign,
    (array_agg(event.medium order by event.created_at asc)
      filter (where event.medium is not null))[1] as medium,
    (array_agg(event.content order by event.created_at asc)
      filter (where event.content is not null))[1] as content
  from events as event
  group by event.session_id
),
paid_by_session as (
  select
    orders.analytics_session_id as session_id,
    sum(orders.total) as revenue
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
    count(*) filter (where session_flags.viewed_catalog) as catalog_sessions,
    count(*) filter (where session_flags.viewed_product) as product_viewers,
    count(*) filter (where session_flags.selected_size) as size_selections,
    count(*) filter (where session_flags.purchase_intent) as purchase_intents,
    count(*) filter (where session_flags.viewed_checkout) as checkout_sessions,
    count(*) filter (where session_flags.redirected_to_payment) as payment_redirects,
    count(*) filter (where session_flags.payment_approved) as payment_approved,
    coalesce(sum(paid_by_session.revenue), 0) as revenue
  from session_flags
  left join paid_by_session using (session_id)
  where session_flags.campaign is not null
  group by session_flags.campaign, session_flags.medium, session_flags.content
  order by catalog_sessions desc, purchase_intents desc, session_flags.campaign asc
  limit 40
)
select coalesce(
  jsonb_agg(to_jsonb(campaign_stats) order by catalog_sessions desc, purchase_intents desc),
  '[]'::jsonb
)
from campaign_stats;
$$;

revoke all on function public.get_marketing_attribution(integer)
  from public, anon, authenticated;
grant execute on function public.get_marketing_attribution(integer)
  to service_role;

comment on function public.get_marketing_attribution(integer) is
  'Embudo interno por utm_campaign, utm_medium y utm_content sin datos personales.';
