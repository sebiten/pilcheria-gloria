alter table public.orders
  add column if not exists checkout_payload_hash text,
  add column if not exists checkout_owner_fingerprint text,
  add column if not exists guest_access_token_hash text;

alter table public.orders
  drop constraint if exists orders_checkout_payload_hash_check,
  add constraint orders_checkout_payload_hash_check
    check (checkout_payload_hash is null or checkout_payload_hash ~ '^[0-9a-f]{64}$');

comment on column public.orders.checkout_payload_hash is
  'SHA-256 del payload original normalizado asociado al UUID idempotente del checkout.';

comment on column public.orders.checkout_owner_fingerprint is
  'Huella del cliente invitado usada para impedir que otra persona recupere su checkout.';

create or replace function public.create_checkout_order(
  p_checkout_id uuid,
  p_clerk_user_id text,
  p_guest_access_token text,
  p_request_fingerprint text,
  p_items jsonb,
  p_shipping_method text,
  p_shipping_address jsonb,
  p_coupon_code text,
  p_expected_subtotal numeric,
  p_analytics_session_id uuid default null,
  p_allow_demo_products boolean default false,
  p_bypass_store_readiness boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_order public.orders%rowtype;
  settings_record public.store_settings%rowtype;
  requested_item record;
  product_record record;
  offer_record record;
  coupon_record public.coupons%rowtype;
  resolved_item jsonb;
  normalized_items jsonb;
  resolved_items jsonb := '[]'::jsonb;
  canonical_payload jsonb;
  payload_hash text;
  normalized_coupon text := nullif(upper(btrim(coalesce(p_coupon_code, ''))), '');
  safe_shipping_method text;
  subtotal numeric(12,2) := 0;
  shipping_cost numeric(12,2) := 0;
  discount_total numeric(12,2) := 0;
  order_total numeric(12,2) := 0;
  requested_quantity integer;
  remaining_quantity integer;
  allocated_quantity integer;
  total_quantity integer;
  line_subtotal numeric(12,2);
  line_cents bigint;
  subtotal_cents bigint;
  remaining_discount_cents bigint;
  allocated_discount_cents bigint;
  net_cents bigint;
  seller_share_cents bigint;
  item_index integer := 0;
  item_count integer;
  coupon_counted boolean := false;
  checkout_address jsonb;
  created_order public.orders%rowtype;
begin
  if p_checkout_id is null then
    raise exception 'Falta el identificador idempotente del checkout';
  end if;
  if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
    raise exception 'No se pudo verificar el propietario del checkout';
  end if;
  if p_clerk_user_id is null
     and (p_guest_access_token is null or btrim(p_guest_access_token) = '') then
    raise exception 'Falta el acceso del checkout invitado';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 20 then
    raise exception 'Carrito invalido';
  end if;
  if jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'La direccion del checkout no es valida';
  end if;
  if p_expected_subtotal is null or p_expected_subtotal < 0 then
    raise exception 'El subtotal esperado no es valido';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_checkout_id::text, 0)
  );

  select jsonb_agg(
    jsonb_build_object(
      'product_id', grouped.product_id,
      'variant_id', grouped.variant_id,
      'quantity', grouped.quantity
    ) order by grouped.product_id, grouped.variant_id
  )
  into normalized_items
  from (
    select
      parsed.product_id,
      parsed.variant_id,
      sum(parsed.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as parsed(
      product_id uuid,
      variant_id uuid,
      quantity integer
    )
    group by parsed.product_id, parsed.variant_id
  ) grouped;

  if normalized_items is null
     or exists (
       select 1
       from jsonb_to_recordset(normalized_items) as item(
         product_id uuid,
         variant_id uuid,
         quantity integer
       )
       where item.product_id is null
          or item.variant_id is null
          or item.quantity <= 0
          or item.quantity > 10
     ) then
    raise exception 'Carrito invalido';
  end if;

  select coalesce(sum(item.quantity), 0)::integer
  into total_quantity
  from jsonb_to_recordset(normalized_items) as item(
    product_id uuid,
    variant_id uuid,
    quantity integer
  );
  if total_quantity <= 0 or total_quantity > 20 then
    raise exception 'El checkout admite hasta 20 prendas por pedido';
  end if;

  safe_shipping_method := case
    when p_shipping_method = 'local_delivery' then 'local_delivery'
    when p_shipping_method = 'pickup' then 'pickup'
    else null
  end;
  if safe_shipping_method is null then
    raise exception 'La modalidad de entrega no es valida';
  end if;
  if nullif(btrim(p_shipping_address->>'name'), '') is null then
    raise exception 'Completa tu nombre';
  end if;
  if nullif(btrim(p_shipping_address->>'phone'), '') is null then
    raise exception 'Completa un telefono de contacto';
  end if;
  if safe_shipping_method = 'local_delivery'
     and (
       nullif(btrim(p_shipping_address->>'street'), '') is null
       or nullif(btrim(p_shipping_address->>'city'), '') is null
     ) then
    raise exception 'Completa la direccion y localidad para la entrega';
  end if;

  canonical_payload := jsonb_build_object(
    'items', normalized_items,
    'shipping_method', safe_shipping_method,
    'shipping_address', p_shipping_address,
    'coupon_code', normalized_coupon,
    'expected_subtotal', round(p_expected_subtotal, 2)
  );
  payload_hash := encode(
    extensions.digest(convert_to(canonical_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into existing_order
  from public.orders
  where id = p_checkout_id
  for update;

  if found then
    if p_clerk_user_id is not null then
      if existing_order.clerk_user_id is distinct from p_clerk_user_id then
        raise exception 'El intento de compra pertenece a otro usuario';
      end if;
    elsif existing_order.clerk_user_id is not null
       or coalesce(
         existing_order.checkout_owner_fingerprint,
         existing_order.shipping_address->>'_checkout_fingerprint'
       ) is distinct from p_request_fingerprint then
      raise exception 'El intento de compra pertenece a otro usuario';
    end if;

    if existing_order.checkout_payload_hash is null then
      if existing_order.shipping_method is distinct from safe_shipping_method
         or upper(coalesce(existing_order.coupon_code, ''))
              is distinct from coalesce(normalized_coupon, '')
         or abs(
           (existing_order.total - coalesce(existing_order.shipping_cost, 0)
             + coalesce(existing_order.discount_total, 0))
           - p_expected_subtotal
         ) > 0.01
         or (existing_order.shipping_address - '_checkout_hash' - '_checkout_fingerprint')
              is distinct from p_shipping_address
         or (
           select jsonb_agg(
             jsonb_build_object(
               'product_id', stored.product_id,
               'variant_id', stored.variant_id,
               'quantity', stored.quantity
             ) order by stored.product_id, stored.variant_id
           )
           from (
             select product_id, variant_id, sum(quantity)::integer as quantity
             from public.order_items
             where order_id = p_checkout_id
             group by product_id, variant_id
           ) stored
         ) is distinct from normalized_items then
        raise exception 'El intento de compra no coincide con el checkout original';
      end if;

      update public.orders
      set checkout_payload_hash = payload_hash,
          checkout_owner_fingerprint = p_request_fingerprint
      where id = p_checkout_id
      returning * into existing_order;
    elsif existing_order.checkout_payload_hash <> payload_hash then
      raise exception 'La clave idempotente ya fue usada con datos diferentes';
    end if;

    if existing_order.status <> 'pending' then
      raise exception 'Este intento de compra ya fue procesado o sigue en curso';
    end if;

    if p_clerk_user_id is null then
      update public.orders
      set guest_access_token = null,
          guest_access_token_hash = encode(
            extensions.digest(btrim(p_guest_access_token), 'sha256'),
            'hex'
          )
      where id = p_checkout_id
      returning * into existing_order;
    end if;

    return to_jsonb(existing_order);
  end if;

  select * into settings_record
  from public.store_settings
  where id = 1
  for update;
  if not found then
    raise exception 'No existe la configuracion de la tienda';
  end if;
  if not p_bypass_store_readiness and (
    settings_record.contact_email is null
    or settings_record.contact_email ~* 'completar|confirmar|ejemplo\\.com|industrial 1234'
    or settings_record.contact_phone is null
    or settings_record.contact_phone ~* 'completar|confirmar|ejemplo\\.com|industrial 1234'
    or settings_record.address_line is null
    or settings_record.address_line ~* 'completar|confirmar|ejemplo\\.com|industrial 1234'
    or settings_record.business_hours is null
    or settings_record.business_hours ~* 'completar|confirmar|ejemplo\\.com|industrial 1234'
    or nullif(btrim(settings_record.legal_name), '') is null
    or nullif(btrim(settings_record.tax_id), '') is null
    or nullif(btrim(settings_record.legal_address), '') is null
  ) then
    raise exception 'La tienda todavia no habilito las compras online';
  end if;
  if safe_shipping_method = 'pickup' and not settings_record.pickup_enabled then
    raise exception 'El retiro en el local no esta disponible';
  end if;
  if safe_shipping_method = 'local_delivery'
     and not settings_record.local_delivery_enabled then
    raise exception 'La entrega local no esta disponible';
  end if;
  if safe_shipping_method = 'local_delivery' and total_quantity < 2 then
    raise exception 'La entrega local requiere al menos 2 prendas';
  end if;
  shipping_cost := case
    when safe_shipping_method = 'local_delivery'
      then round(coalesce(settings_record.local_delivery_cost, 0), 2)
    else 0
  end;

  for requested_item in
    select *
    from jsonb_to_recordset(normalized_items) as item(
      product_id uuid,
      variant_id uuid,
      quantity integer
    )
    order by product_id, variant_id
  loop
    select
      product.id as product_id,
      product.slug,
      product.active as product_active,
      product.uniform_price_group_code,
      variant.id as variant_id,
      variant.active as variant_active
    into product_record
    from public.products product
    join public.product_variants variant
      on variant.product_id = product.id
    where product.id = requested_item.product_id
      and variant.id = requested_item.variant_id
    for update of product, variant;

    if not found or not coalesce(product_record.product_active, false) then
      raise exception 'Uno de los productos ya no esta disponible';
    end if;
    if not coalesce(product_record.variant_active, false) then
      raise exception 'Una variante ya no esta disponible';
    end if;
    if not p_allow_demo_products and product_record.slug like 'gloria-demo-%' then
      raise exception 'Este producto de demostracion no esta habilitado para la venta';
    end if;

    remaining_quantity := requested_item.quantity;
    for offer_record in
      select
        offer.id,
        offer.variant_id,
        offer.source_id,
        offer.availability_mode,
        coalesce(price_group.price, offer.sale_price)::numeric(12,2) as unit_price,
        offer.stock_quantity,
        offer.priority,
        source.code as source_code,
        source.name as source_name,
        source.seller_share_rate
      from public.variant_offers offer
      join public.inventory_sources source on source.id = offer.source_id
      left join public.uniform_price_groups price_group
        on price_group.code = product_record.uniform_price_group_code
      where offer.variant_id = requested_item.variant_id
        and offer.active
        and source.active
        and (offer.availability_mode = 'on_demand' or offer.stock_quantity > 0)
      order by offer.priority, offer.id
      for update of offer, source
    loop
      exit when remaining_quantity <= 0;
      if offer_record.unit_price is null or offer_record.unit_price <= 0 then
        raise exception 'El precio de una variante no es valido';
      end if;

      allocated_quantity := case
        when offer_record.availability_mode = 'on_demand' then remaining_quantity
        else least(remaining_quantity, offer_record.stock_quantity)
      end;
      if allocated_quantity <= 0 then
        continue;
      end if;

      if offer_record.availability_mode = 'finite' then
        update public.variant_offers
        set stock_quantity = stock_quantity - allocated_quantity,
            updated_at = now()
        where id = offer_record.id;
      end if;

      line_subtotal := round(offer_record.unit_price * allocated_quantity, 2);
      subtotal := subtotal + line_subtotal;
      resolved_items := resolved_items || jsonb_build_array(jsonb_build_object(
        'product_id', requested_item.product_id,
        'variant_id', requested_item.variant_id,
        'offer_id', offer_record.id,
        'source_id', offer_record.source_id,
        'source_code', offer_record.source_code,
        'source_name', offer_record.source_name,
        'availability_mode', offer_record.availability_mode,
        'seller_share_rate', offer_record.seller_share_rate,
        'quantity', allocated_quantity,
        'unit_price', offer_record.unit_price,
        'line_subtotal', line_subtotal
      ));
      remaining_quantity := remaining_quantity - allocated_quantity;
    end loop;

    if remaining_quantity > 0 then
      raise exception 'Stock insuficiente para una variante del pedido';
    end if;

    update public.product_variants variant
    set stock = coalesce((
      select sum(offer.stock_quantity)::integer
      from public.variant_offers offer
      where offer.variant_id = variant.id
        and offer.active
        and offer.availability_mode = 'finite'
    ), 0)
    where variant.id = requested_item.variant_id;
  end loop;

  subtotal := round(subtotal, 2);
  if abs(subtotal - round(p_expected_subtotal, 2)) > 0.01 then
    raise exception 'El precio o la disponibilidad cambio. Revisa el carrito antes de pagar';
  end if;

  if normalized_coupon is not null then
    select * into coupon_record
    from public.coupons
    where upper(code) = normalized_coupon
    order by id
    limit 1
    for update;

    if not found or not coalesce(coupon_record.active, false) then
      raise exception 'El cupon no es valido';
    end if;
    if coupon_record.expires_at is not null and coupon_record.expires_at < now() then
      raise exception 'El cupon esta vencido';
    end if;
    if coupon_record.max_uses is not null
       and coalesce(coupon_record.used_count, 0) >= coupon_record.max_uses then
      raise exception 'El cupon ya no tiene usos disponibles';
    end if;
    if coupon_record.min_purchase is not null
       and subtotal < coupon_record.min_purchase then
      raise exception 'El subtotal no alcanza el minimo requerido para este cupon';
    end if;

    discount_total := round(least(
      subtotal,
      greatest(
        0,
        case
          when coupon_record.type = 'percentage'
            then subtotal * coupon_record.value / 100
          else coupon_record.value
        end
      )
    ), 2);
    update public.coupons
    set used_count = coalesce(used_count, 0) + 1
    where id = coupon_record.id;
    coupon_counted := true;
  end if;

  order_total := round(subtotal - discount_total + shipping_cost, 2);
  if order_total <= 0 then
    raise exception 'El total del carrito no es valido';
  end if;

  checkout_address := p_shipping_address || jsonb_build_object(
    '_checkout_hash', payload_hash,
    '_checkout_fingerprint', p_request_fingerprint
  );

  insert into public.orders (
    id,
    clerk_user_id,
    total,
    shipping_cost,
    shipping_method,
    shipping_address,
    guest_access_token,
    guest_access_token_hash,
    coupon_code,
    discount_total,
    status,
    reservation_expires_at,
    stock_reserved,
    stock_restored,
    coupon_counted,
    analytics_session_id,
    checkout_payload_hash,
    checkout_owner_fingerprint
  ) values (
    p_checkout_id,
    p_clerk_user_id,
    order_total,
    shipping_cost,
    safe_shipping_method,
    checkout_address,
    null,
    case
      when p_clerk_user_id is null then encode(
        extensions.digest(btrim(p_guest_access_token), 'sha256'),
        'hex'
      )
      else null
    end,
    normalized_coupon,
    discount_total,
    'pending',
    now() + interval '30 minutes',
    true,
    false,
    coupon_counted,
    p_analytics_session_id,
    payload_hash,
    p_request_fingerprint
  ) returning * into created_order;

  subtotal_cents := round(subtotal * 100)::bigint;
  remaining_discount_cents := round(discount_total * 100)::bigint;
  item_count := jsonb_array_length(resolved_items);

  for resolved_item in select value from jsonb_array_elements(resolved_items)
  loop
    item_index := item_index + 1;
    line_cents := round((resolved_item->>'line_subtotal')::numeric * 100)::bigint;
    allocated_discount_cents := case
      when item_index = item_count then remaining_discount_cents
      else least(
        remaining_discount_cents,
        case
          when subtotal_cents > 0
            then round(line_cents * round(discount_total * 100) / subtotal_cents)::bigint
          else 0
        end
      )
    end;
    remaining_discount_cents := remaining_discount_cents - allocated_discount_cents;
    net_cents := line_cents - allocated_discount_cents;
    seller_share_cents := round(
      net_cents * (resolved_item->>'seller_share_rate')::numeric
    )::bigint;

    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      offer_id,
      source_id,
      source_code,
      source_name,
      availability_mode,
      seller_share_rate,
      quantity,
      unit_price,
      line_subtotal,
      discount_allocated,
      net_amount,
      seller_share,
      partner_share,
      procurement_status
    ) values (
      p_checkout_id,
      (resolved_item->>'product_id')::uuid,
      (resolved_item->>'variant_id')::uuid,
      (resolved_item->>'offer_id')::uuid,
      (resolved_item->>'source_id')::uuid,
      resolved_item->>'source_code',
      resolved_item->>'source_name',
      resolved_item->>'availability_mode',
      (resolved_item->>'seller_share_rate')::numeric,
      (resolved_item->>'quantity')::integer,
      (resolved_item->>'unit_price')::numeric,
      line_cents / 100.0,
      allocated_discount_cents / 100.0,
      net_cents / 100.0,
      seller_share_cents / 100.0,
      (net_cents - seller_share_cents) / 100.0,
      case
        when resolved_item->>'availability_mode' = 'on_demand'
          then 'awaiting_payment'
        else 'not_required'
      end
    );
  end loop;

  return to_jsonb(created_order);
end;
$$;

revoke all on function public.create_checkout_order(
  uuid, text, text, text, jsonb, text, jsonb, text, numeric, uuid, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_checkout_order(
  uuid, text, text, text, jsonb, text, jsonb, text, numeric, uuid, boolean, boolean
) to service_role;

comment on function public.create_checkout_order(
  uuid, text, text, text, jsonb, text, jsonb, text, numeric, uuid, boolean, boolean
) is
  'Crea o recupera un checkout idempotente y reserva stock/cupon dentro de una unica transaccion.';

create table public.order_payment_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  attempt_id uuid references public.order_payment_attempts(id) on delete set null,
  source text not null,
  payment_id text not null,
  payment_status text not null,
  previous_order_status text not null,
  next_order_status text not null,
  ambiguous boolean not null default false,
  candidate_payment_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_payment_reconciliation_source_check
    check (source in ('webhook', 'buyer_return', 'order_query', 'expiration_cron')),
  constraint order_payment_reconciliation_candidates_check
    check (jsonb_typeof(candidate_payment_ids) = 'array')
);

create unique index order_payment_reconciliation_dedupe_idx
  on public.order_payment_reconciliation_events (
    order_id,
    source,
    payment_id,
    payment_status,
    next_order_status
  );

create index order_payment_reconciliation_review_idx
  on public.order_payment_reconciliation_events (created_at, order_id)
  where ambiguous;

alter table public.order_payment_reconciliation_events enable row level security;
revoke all on table public.order_payment_reconciliation_events
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.order_payment_reconciliation_events to service_role;

create or replace function public.reconcile_order_payment_attempt(
  p_order_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_external_id text,
  p_payment_status text,
  p_payment_status_detail text,
  p_receiver_account_id text,
  p_source text,
  p_ambiguous boolean default false,
  p_candidate_payment_ids jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status text;
  next_status text;
  effective_status text := p_payment_status;
  effective_detail text := p_payment_status_detail;
begin
  if p_source not in ('webhook', 'buyer_return', 'order_query', 'expiration_cron') then
    raise exception 'Origen de conciliacion invalido';
  end if;
  if jsonb_typeof(coalesce(p_candidate_payment_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de pagos candidatos no es valida';
  end if;

  select status into previous_status
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if p_ambiguous and p_payment_status = 'approved' then
    effective_status := 'review';
    effective_detail := 'Varios pagos aprobados para la misma orden';
  end if;

  next_status := public.apply_order_payment_attempt(
    p_order_id,
    p_attempt_id,
    p_provider,
    p_external_id,
    effective_status,
    effective_detail,
    p_receiver_account_id
  );

  insert into public.order_payment_reconciliation_events (
    order_id,
    attempt_id,
    source,
    payment_id,
    payment_status,
    previous_order_status,
    next_order_status,
    ambiguous,
    candidate_payment_ids
  ) values (
    p_order_id,
    p_attempt_id,
    p_source,
    p_external_id,
    p_payment_status,
    previous_status,
    next_status,
    p_ambiguous,
    coalesce(p_candidate_payment_ids, '[]'::jsonb)
  ) on conflict do nothing;

  return next_status;
end;
$$;

revoke all on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) to service_role;

comment on function public.reconcile_order_payment_attempt(
  uuid, uuid, text, text, text, text, text, text, boolean, jsonb
) is
  'Aplica una conciliacion de pago y registra de forma atomica el pago y origen que causaron la transicion.';
