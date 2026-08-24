"use server";

import { auth } from "@clerk/nextjs/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureUserProfile, getProfile, requireAdmin } from "@/actions/auth";
import {
  searchPaymentsByExternalReference,
} from "@/lib/mercadopago/client";
import { revalidatePath } from "next/cache";
import type { OrderStatus, ShippingAddress } from "@/types";
import {
  canUseLocalDelivery,
  getShippingCost,
  LOCAL_DELIVERY_MIN_ITEMS,
} from "@/lib/commerce";
import { getStoreSettings } from "@/actions/store-settings";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import {
  applyMercadoPagoPayment,
  cancelOrderAndRelease,
  claimOrderCoupon,
  getOrderReservationExpiration,
  reserveOrderStock,
} from "@/lib/orders/payment-state";
import { sendOrderEmail } from "@/lib/notifications/email";
import { isStoreReadyForCheckout } from "@/lib/store-readiness";
import { calculateCouponDiscount } from "@/lib/coupons/server";
import {
  formatStorefrontVariantSize,
  getCheckoutOffers,
  PRODUCT_PRICE_GROUP_SELECT,
  type CheckoutOffer,
  type RawVariantWithOffers,
} from "@/lib/inventory";
import {
  assertCheckoutRouteCapability,
  type CheckoutRouteCapability,
} from "@/lib/security/checkout-capability";
import { secureTokenEquals } from "@/lib/orders/confirmation-access";
import { getPaymentAdapter } from "@/lib/payments/providers";
import type { PaymentProvider } from "@/types";
import {
  getRiskRetryNotBefore,
  RISK_RETRY_COOLDOWN_MINUTES,
} from "@/lib/orders/payment-rejection";

const ORDER_STATUS_VALUES: OrderStatus[] = [
  "pending",
  "paid",
  "payment_review",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "cancelled",
];

function assertValidOrderStatus(status: string): asserts status is OrderStatus {
  if (!ORDER_STATUS_VALUES.includes(status as OrderStatus)) {
    throw new Error("Estado de orden invalido");
  }
}

type CheckoutItem = {
  product_id: string;
  variant_id: string;
  quantity: number;
};

type ResolvedCheckoutItem = CheckoutItem & {
  title: string;
  slug: string;
  unitPrice: number;
  pictureUrl?: string;
  offer: CheckoutOffer | null;
};

type FinancialCheckoutItem = ResolvedCheckoutItem & {
  lineSubtotal: number;
  discountAllocated: number;
  netAmount: number;
  sellerShare: number;
  partnerShare: number;
};

type CheckoutAddressMetadata = ShippingAddress & {
  _checkout_hash: string;
  _checkout_fingerprint: string;
  _checkout_preference?: {
    id: string;
    init_point: string;
    sandbox_init_point?: string;
  };
};

type ExistingCheckoutOrder = Record<string, any> & {
  items?: Array<{
    product_id: string | null;
    variant_id: string | null;
    quantity: number;
  }>;
};

function createGuestAccessToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function revalidateProductCacheAfterStockChange() {
  try {
    revalidateProductCacheFromRouteHandler();
  } catch (error) {
    console.error("Error revalidando cache de productos:", error);
  }
}

function normalizeCheckoutItems(items: CheckoutItem[]) {
  const merged = new Map<string, CheckoutItem>();

  for (const item of items) {
    if (
      !item.product_id ||
      !item.variant_id ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 10
    ) {
      throw new Error("Carrito invalido");
    }

    const variantId = item.variant_id;
    const key = `${item.product_id}:${variantId}`;
    const existing = merged.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      if (existing.quantity > 10) {
        throw new Error("La cantidad máxima por producto es 10");
      }
      continue;
    }

    merged.set(key, {
      product_id: item.product_id,
      variant_id: variantId,
      quantity: item.quantity,
    });
  }

  const normalizedItems = Array.from(merged.values());
  if (normalizedItems.length === 0) {
    throw new Error("El carrito esta vacio");
  }

  return normalizedItems;
}

function normalizeCheckoutText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getComparableShippingAddress(address: Partial<ShippingAddress> | null) {
  return {
    name: normalizeCheckoutText(address?.name),
    email: normalizeCheckoutText(address?.email),
    phone: normalizeCheckoutText(address?.phone),
    street: normalizeCheckoutText(address?.street),
    city: normalizeCheckoutText(address?.city),
    state: normalizeCheckoutText(address?.state),
    zip: normalizeCheckoutText(address?.zip),
    references: normalizeCheckoutText(address?.references),
  };
}

function getComparableCheckoutItems(
  items: Array<{
    product_id: string | null;
    variant_id: string | null;
    quantity: number;
  }>
) {
  const quantities = new Map<string, number>();

  for (const item of items) {
    const key = `${item.product_id ?? ""}:${item.variant_id ?? ""}`;
    quantities.set(key, (quantities.get(key) ?? 0) + Number(item.quantity));
  }

  return Array.from(quantities, ([key, quantity]) => ({ key, quantity })).sort(
    (first, second) => first.key.localeCompare(second.key)
  );
}

function assertExistingCheckoutMatches(
  order: ExistingCheckoutOrder,
  input: {
    userId: string | null;
    requestFingerprint: string;
    items: CheckoutItem[];
    shippingMethod: string;
    shippingAddress: ShippingAddress;
    couponCode?: string;
    expectedSubtotal?: number;
  }
) {
  const existingAddress =
    order.shipping_address as CheckoutAddressMetadata | null;
  const sameOwner = input.userId
    ? order.clerk_user_id === input.userId
    : !order.clerk_user_id &&
      existingAddress?._checkout_fingerprint === input.requestFingerprint;
  const requestedItems = getComparableCheckoutItems(
    normalizeCheckoutItems(input.items)
  );
  const storedItems = getComparableCheckoutItems(order.items ?? []);
  const storedSubtotal =
    Number(order.total) -
    Number(order.shipping_cost ?? 0) +
    Number(order.discount_total ?? 0);
  const sameSubtotal =
    input.expectedSubtotal === undefined ||
    Math.abs(storedSubtotal - input.expectedSubtotal) <= 0.01;
  const sameCheckout =
    order.shipping_method ===
      (input.shippingMethod === "local_delivery" ? "local_delivery" : "pickup") &&
    JSON.stringify(getComparableShippingAddress(existingAddress)) ===
      JSON.stringify(getComparableShippingAddress(input.shippingAddress)) &&
    JSON.stringify(storedItems) === JSON.stringify(requestedItems) &&
    normalizeCheckoutText(order.coupon_code)?.toUpperCase() ===
      normalizeCheckoutText(input.couponCode)?.toUpperCase() &&
    sameSubtotal;

  if (!sameOwner || !sameCheckout) {
    throw new Error("El intento de compra no coincide con el checkout original");
  }

  if (order.status !== "pending") {
    throw new Error("Este intento de compra ya fue procesado o sigue en curso");
  }
}

async function resolveCheckoutItems(
  items: CheckoutItem[],
  options: { allowDemoProducts: boolean }
) {
  const normalizedItems = normalizeCheckoutItems(items);
  const supabase = getSupabaseAdmin();
  const { data: products, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      base_price,
      active,
      ${PRODUCT_PRICE_GROUP_SELECT},
      images:product_images(url, sort_order),
      variants:product_variants(
        id,
        product_id,
        size,
        size_system,
        school_level,
        color,
        price_override,
        stock,
        active,
        offers:variant_offers(
          id,
          variant_id,
          source_id,
          availability_mode,
          sale_price,
          stock_quantity,
          priority,
          lead_time_min_hours,
          lead_time_max_hours,
          active,
          source:inventory_sources(
            id,
            code,
            name,
            source_type,
            seller_share_rate,
            priority,
            active
          )
        )
      )
    `)
    .in(
      "id",
      Array.from(new Set(normalizedItems.map((item) => item.product_id)))
    )
    .eq("active", true);

  if (error) {
    throw error;
  }

  const productsById = new Map((products || []).map((product: any) => [product.id, product]));
  const resolvedItems: ResolvedCheckoutItem[] = [];

  for (const item of normalizedItems) {
    const product = productsById.get(item.product_id);
    if (!product) {
      throw new Error("Uno de los productos ya no esta disponible");
    }

    if (
      process.env.NODE_ENV === "production" &&
      product.slug?.startsWith("gloria-demo-") &&
      !options.allowDemoProducts
    ) {
      throw new Error("Este producto de demostración no está habilitado para la venta");
    }

    const sortedImages = [...(product.images || [])].sort(
      (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const variant = item.variant_id
      ? (product.variants || []).find((current: any) => current.id === item.variant_id)
      : null;

    if (!variant || variant.active === false) {
      throw new Error(`La variante de ${product.name} ya no esta disponible`);
    }

    const variantLabel = variant
      ? [
          variant.size
            ? `Talle ${formatStorefrontVariantSize({
                size: variant.size,
                sizeSystem: variant.size_system ?? null,
              })}`
            : null,
          variant.school_level === "primary"
            ? "Diseño Primaria"
            : variant.school_level === "secondary"
              ? "Diseño Secundaria"
              : null,
          variant.color,
        ]
          .filter(Boolean)
          .join(" - ")
      : "";
    const commonItem = {
      ...item,
      slug: product.slug,
      title: variantLabel ? `${product.name} - ${variantLabel}` : product.name,
      pictureUrl: sortedImages[0]?.url,
    };

    let remaining = item.quantity;
    const configuredPublicPrice = Number(product.uniform_price_group?.price);
    const publicUnitPrice =
      Number.isFinite(configuredPublicPrice) && configuredPublicPrice > 0
        ? configuredPublicPrice
        : null;
    const offers = getCheckoutOffers(
      variant as RawVariantWithOffers,
      publicUnitPrice
    );

    for (const offer of offers) {
      if (remaining <= 0) break;
      const quantity =
        offer.stockQuantity == null
          ? remaining
          : Math.min(remaining, offer.stockQuantity);
      if (quantity <= 0) continue;

      resolvedItems.push({
        ...commonItem,
        quantity,
        unitPrice: offer.salePrice,
        offer,
      });
      remaining -= quantity;
    }

    if (remaining > 0) {
      throw new Error(`Stock insuficiente para ${product.name}`);
    }
  }

  return resolvedItems;
}

function createCheckoutHash(input: {
  items: ResolvedCheckoutItem[];
  shippingMethod: string;
  shippingAddress: ShippingAddress;
  couponCode: string | null;
  total: number;
}) {
  const canonicalItems = input.items
    .map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      offerId: item.offer?.id ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
    .sort((a, b) =>
      `${a.productId}:${a.variantId ?? ""}:${a.offerId ?? ""}`.localeCompare(
        `${b.productId}:${b.variantId ?? ""}:${b.offerId ?? ""}`
      )
    );

  return createHash("sha256")
    .update(
      JSON.stringify({
        items: canonicalItems,
        shippingMethod: input.shippingMethod,
        shippingAddress: input.shippingAddress,
        couponCode: input.couponCode,
        total: input.total,
      })
    )
    .digest("hex");
}

async function restoreOrderStock(orderId: string) {
  await cancelOrderAndRelease(orderId, "Cancelada desde el panel");
  revalidateProductCacheAfterStockChange();
}

async function clearUserCart(userId: string | null) {
  if (!userId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("clerk_user_id", userId);

  if (error) {
    throw error;
  }
}

async function reconcilePendingOrderPayment(order: any) {
  if (order.status !== "pending" || order.mercadopago_id) {
    return order;
  }

  if (
    order.payment_attempts?.some(
      (attempt: any) =>
        attempt.provider === "bank_transfer" &&
        ["pending", "review", "approved"].includes(attempt.status)
    )
  ) {
    return order;
  }

  try {
    const paymentSearch = await searchPaymentsByExternalReference(order.id);
    const payments = Array.isArray(paymentSearch?.results)
      ? paymentSearch.results
      : [];
    const payment =
      payments.find((item: any) => item.status === "approved") ??
      payments.find((item: any) => item.status);

    if (!payment?.status) {
      return order;
    }

    if (
      !["approved", "rejected", "cancelled", "refunded", "charged_back"].includes(
        payment.status
      )
    ) {
      return order;
    }

    const nextStatus = await applyMercadoPagoPayment(order.id, payment);
    const emailEvent =
      nextStatus === "paid"
        ? "payment-approved"
        : nextStatus === "payment_review"
          ? "payment-review"
          : nextStatus === "cancelled"
            ? "cancelled"
            : null;
    if (emailEvent) {
      await sendOrderEmail(order.id, emailEvent).catch((notificationError) => {
        console.error("No se pudo notificar la conciliación del pedido:", notificationError);
      });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order.id)
      .single();

    if (error || !data) {
      console.error("Error reconciliando orden con MercadoPago:", error);
      return order;
    }

    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${order.id}`);
    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${order.id}`);

    return {
      ...order,
      ...data,
      status: nextStatus,
    };
  } catch (error) {
    console.error("Error buscando pagos de MercadoPago para orden pendiente:", error);
    return order;
  }
}

function allocateOrderFinancials(
  items: ResolvedCheckoutItem[],
  discountTotal: number
): FinancialCheckoutItem[] {
  const lineCents = items.map((item) =>
    Math.round(item.unitPrice * item.quantity * 100)
  );
  const subtotalCents = lineCents.reduce((sum, amount) => sum + amount, 0);
  let remainingDiscountCents = Math.min(
    Math.round(discountTotal * 100),
    subtotalCents
  );

  return items.map((item, index) => {
    const currentLineCents = lineCents[index];
    const discountCents =
      index === items.length - 1
        ? remainingDiscountCents
        : Math.min(
            remainingDiscountCents,
            Math.round(
              subtotalCents > 0
                ? (currentLineCents * Math.round(discountTotal * 100)) /
                    subtotalCents
                : 0
            )
          );
    remainingDiscountCents -= discountCents;
    const netCents = currentLineCents - discountCents;
    const sellerShareCents = Math.round(
      netCents * Number(item.offer?.sellerShareRate ?? 1)
    );

    return {
      ...item,
      lineSubtotal: currentLineCents / 100,
      discountAllocated: discountCents / 100,
      netAmount: netCents / 100,
      sellerShare: sellerShareCents / 100,
      partnerShare: (netCents - sellerShareCents) / 100,
    };
  });
}

export async function createOrder(
  {
    items,
    shippingMethod,
    shippingAddress,
    couponCode,
    expectedSubtotal,
    checkoutRequestId,
    requestFingerprint,
    analyticsSessionId,
  }: {
    items: CheckoutItem[];
    shippingMethod: string;
    shippingAddress: ShippingAddress;
    couponCode?: string;
    expectedSubtotal?: number;
    checkoutRequestId: string;
    requestFingerprint: string;
    analyticsSessionId?: string | null;
  },
  capability: CheckoutRouteCapability
) {
  assertCheckoutRouteCapability(capability);
  const { userId } = await auth();
  const profile = userId ? await ensureUserProfile() : null;

  const supabase = getSupabaseAdmin();
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(product_id, variant_id, quantity)
    `)
    .eq("id", checkoutRequestId)
    .maybeSingle();

  if (existingOrderError) {
    throw existingOrderError;
  }

  if (existingOrder) {
    assertExistingCheckoutMatches(existingOrder, {
      userId,
      requestFingerprint,
      items,
      shippingMethod,
      shippingAddress,
      couponCode,
      expectedSubtotal,
    });
    await clearUserCart(userId);
    return { order: existingOrder };
  }

  const resolvedItems = await resolveCheckoutItems(items, {
    allowDemoProducts: profile?.role === "admin",
  });
  const subtotal = resolvedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  if (
    expectedSubtotal !== undefined &&
    Math.abs(subtotal - expectedSubtotal) > 0.01
  ) {
    throw new Error(
      "El precio o la disponibilidad cambió. Revisá el carrito antes de pagar."
    );
  }
  const settings = await getStoreSettings();

  if (
    process.env.E2E_MERCADOPAGO_FAKE !== "1" &&
    profile?.role !== "admin" &&
    !isStoreReadyForCheckout(settings)
  ) {
    throw new Error(
      "La tienda todavía no habilitó las compras online. Contactanos por WhatsApp."
    );
  }

  const discount = await calculateCouponDiscount(couponCode, subtotal);
  const financialItems = allocateOrderFinancials(
    resolvedItems,
    discount.discount
  );
  const safeShippingMethod =
    shippingMethod === "local_delivery" ? "local_delivery" : "pickup";

  if (safeShippingMethod === "pickup" && !settings.pickup_enabled) {
    throw new Error("El retiro en el local no está disponible");
  }

  if (
    safeShippingMethod === "local_delivery" &&
    !settings.local_delivery_enabled
  ) {
    throw new Error("La entrega local no está disponible");
  }

  if (
    safeShippingMethod === "local_delivery" &&
    !canUseLocalDelivery(resolvedItems)
  ) {
    throw new Error(
      `La entrega local está disponible únicamente para compras de ${LOCAL_DELIVERY_MIN_ITEMS} o más prendas.`
    );
  }

  if (!shippingAddress.name?.trim()) {
    throw new Error("Completá tu nombre");
  }

  if (!shippingAddress.phone?.trim()) {
    throw new Error("Completá un teléfono de contacto");
  }

  if (
    safeShippingMethod === "local_delivery" &&
    (!shippingAddress.street?.trim() || !shippingAddress.city?.trim())
  ) {
    throw new Error("Completá la dirección y localidad para la entrega");
  }

  const shippingCost = getShippingCost(safeShippingMethod, {
    localDeliveryCost: settings.local_delivery_cost,
  });
  const total = subtotal - discount.discount + shippingCost;
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("El total del carrito no es válido");
  }

  const checkoutHash = createCheckoutHash({
    items: resolvedItems,
    shippingMethod: safeShippingMethod,
    shippingAddress,
    couponCode: discount.code,
    total,
  });
  const guestAccessToken = userId ? null : createGuestAccessToken();
  const reservationExpiresAt = getOrderReservationExpiration();
  const checkoutAddress: CheckoutAddressMetadata = {
    ...shippingAddress,
    _checkout_hash: checkoutHash,
    _checkout_fingerprint: requestFingerprint,
  };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      id: checkoutRequestId,
      clerk_user_id: userId ?? null,
      total,
      shipping_cost: shippingCost,
      shipping_method: safeShippingMethod,
      shipping_address: checkoutAddress,
      guest_access_token: guestAccessToken,
      coupon_code: discount.code,
      discount_total: discount.discount,
      status: "pending",
      reservation_expires_at: reservationExpiresAt,
      analytics_session_id: analyticsSessionId ?? null,
    })
    .select()
    .single();

  if (orderError) {
    if (orderError.code === "23505") {
      throw new Error("Este intento de compra ya se está procesando");
    }
    throw orderError;
  }

  const { error: orderItemsError } = await supabase.from("order_items").insert(
    financialItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      offer_id: item.offer?.id ?? null,
      source_id: item.offer?.sourceId ?? null,
      source_code: item.offer?.sourceCode ?? null,
      source_name: item.offer?.sourceName ?? null,
      availability_mode: item.offer?.availabilityMode ?? "finite",
      seller_share_rate: item.offer?.sellerShareRate ?? 1,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_subtotal: item.lineSubtotal,
      discount_allocated: item.discountAllocated,
      net_amount: item.netAmount,
      seller_share: item.sellerShare,
      partner_share: item.partnerShare,
      procurement_status:
        item.offer?.availabilityMode === "on_demand"
          ? "awaiting_payment"
          : "not_required",
    }))
  );

  if (orderItemsError) {
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    throw orderItemsError;
  }

  try {
    await reserveOrderStock(order.id);
    revalidateProductCacheAfterStockChange();
  } catch (error) {
    await cancelOrderAndRelease(
      order.id,
      "No se pudo reservar el stock del pedido"
    );
    throw error;
  }

  try {
    await claimOrderCoupon(order.id);
  } catch (error) {
    await cancelOrderAndRelease(
      order.id,
      "No se pudo confirmar el cupón del pedido"
    );
    revalidateProductCacheAfterStockChange();
    throw error;
  }

  await clearUserCart(userId);
  await sendOrderEmail(order.id, "order-created").catch((notificationError) => {
    console.error("No se pudo enviar el email de reserva:", notificationError);
  });

  return { order };
}

export async function startOrderPayment(
  orderId: string,
  provider: PaymentProvider,
  capability: CheckoutRouteCapability,
  deviceId?: string | null
) {
  assertCheckoutRouteCapability(capability);
  const supabase = getSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, total, shipping_address, reservation_expires_at")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw orderError ?? new Error("Pedido no encontrado");
  }
  if (order.status !== "pending") {
    throw new Error("Este pedido no admite un nuevo intento de pago");
  }
  if (
    !order.reservation_expires_at ||
    new Date(order.reservation_expires_at).getTime() <= Date.now()
  ) {
    throw new Error("La reserva de stock venció. Volvé al carrito para continuar");
  }

  const { data: currentAttempt, error: currentAttemptError } = await supabase
    .from("order_payment_attempts")
    .select("id, provider, status")
    .eq("order_id", orderId)
    .in("status", ["created", "pending", "in_process", "review"])
    .maybeSingle();
  if (currentAttemptError) throw currentAttemptError;

  if (provider === "bank_transfer") {
    const { data: attemptId, error: bankError } = await supabase.rpc(
      "create_bank_transfer_attempt",
      { p_order_id: orderId }
    );
    if (bankError) throw new Error(bankError.message);
    const checkoutUrl = `/order-confirmation/${orderId}`;
    const { data: bankAttempt, error: bankAttemptError } = await supabase
      .from("order_payment_attempts")
      .update({ checkout_url: checkoutUrl, updated_at: new Date().toISOString() })
      .eq("id", attemptId)
      .select()
      .single();
    if (bankAttemptError || !bankAttempt) {
      throw bankAttemptError ?? new Error("No se pudo preparar la transferencia");
    }
    return bankAttempt;
  }

  if (currentAttempt?.provider === "bank_transfer") {
    if (provider !== "mercadopago") {
      throw new Error("La transferencia solo puede reemplazarse por Mercado Pago.");
    }
    const { error: replaceError } = await supabase.rpc(
      "replace_bank_transfer_attempt",
      { p_order_id: orderId, p_attempt_id: currentAttempt.id }
    );
    if (replaceError) throw new Error(replaceError.message);
  }

  const adapter = getPaymentAdapter(provider);

  const address = (order.shipping_address || {}) as CheckoutAddressMetadata;
  const checkoutFingerprint = address._checkout_fingerprint;
  let relatedOrderIds = [orderId];

  if (checkoutFingerprint && address.phone) {
    const { data: relatedOrders, error: relatedOrdersError } = await supabase
      .from("orders")
      .select("id")
      .eq("shipping_address->>_checkout_fingerprint", checkoutFingerprint)
      .eq("shipping_address->>phone", address.phone)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(20);
    if (relatedOrdersError) throw relatedOrdersError;
    relatedOrderIds = Array.from(
      new Set([orderId, ...(relatedOrders || []).map((item) => item.id)])
    );
  }

  const { data: previousAttempt, error: previousAttemptError } = await supabase
    .from("order_payment_attempts")
    .select("provider, status, status_detail, terminal_at, updated_at")
    .in("order_id", relatedOrderIds)
    .eq("provider", provider)
    .eq("status", "rejected")
    .gte(
      "terminal_at",
      new Date(
        Date.now() - RISK_RETRY_COOLDOWN_MINUTES * 60 * 1000
      ).toISOString()
    )
    .order("terminal_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousAttemptError) throw previousAttemptError;

  const retryNotBefore = getRiskRetryNotBefore(previousAttempt || undefined);
  if (retryNotBefore && new Date(retryNotBefore).getTime() > Date.now()) {
    const remainingMinutes = Math.max(
      1,
      Math.ceil((new Date(retryNotBefore).getTime() - Date.now()) / 60_000)
    );
    throw new Error(
      `Mercado Pago rechazó el intento por seguridad. Esperá ${remainingMinutes} min o elegí otro procesador.`
    );
  }

  const { data: activeAttempt, error: activeAttemptError } = await supabase
    .from("order_payment_attempts")
    .select("*")
    .eq("order_id", orderId)
    .in("status", ["created", "pending", "in_process", "review"])
    .maybeSingle();

  if (activeAttemptError) throw activeAttemptError;
  if (activeAttempt) {
    if (
      activeAttempt.provider === provider &&
      activeAttempt.checkout_url &&
      activeAttempt.status !== "review"
    ) {
      return activeAttempt;
    }
    throw new Error(
      activeAttempt.status === "review"
        ? "El pago está siendo verificado. No inicies otro intento."
        : "Ya existe un intento de pago activo para este pedido."
    );
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("order_payment_attempts")
    .insert({
      order_id: orderId,
      provider,
      status: "created",
      amount: Number(order.total),
      currency: "ARS",
    })
    .select()
    .single();

  if (attemptError || !attempt) {
    if (attemptError?.code === "23505") {
      throw new Error("Ya existe un intento de pago activo para este pedido.");
    }
    throw attemptError ?? new Error("No se pudo registrar el intento de pago");
  }

  try {
    const started = await adapter.start({
      attemptId: attempt.id,
      orderId,
      amount: Number(order.total),
      currency: "ARS",
      reservationExpiresAt: order.reservation_expires_at,
      deviceId,
      buyer: {
        name: address.name,
        email: address.email,
        phone: address.phone || "",
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
      },
    });
    const { data: updatedAttempt, error: updateError } = await supabase
      .from("order_payment_attempts")
      .update({
        external_id: started.externalId,
        checkout_url: started.checkoutUrl,
        status: started.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("status", "created")
      .select()
      .single();

    if (updateError || !updatedAttempt) {
      throw updateError ?? new Error("No se pudo guardar el enlace de pago");
    }
    return updatedAttempt;
  } catch (error) {
    await supabase
      .from("order_payment_attempts")
      .update({
        status: "failed",
        status_detail:
          error instanceof Error ? error.message.slice(0, 300) : "Error desconocido",
        terminal_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("status", "created");
    throw error;
  }
}

export async function getOrders() {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(
        *,
        product:products(*)
      ),
      refunds:manual_refunds(
        id,
        amount,
        status,
        method,
        transfer_reference,
        created_at,
        paid_at
      ),
      payment_attempts:order_payment_attempts(
        id,
        provider,
        status,
        status_detail,
        amount,
        checkout_url,
        created_at,
        updated_at,
        transfer_notified_at,
        transfer_reviewed_at,
        transfer_reviewed_by,
        bank_reference
      )
    `)
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Promise.all((data || []).map((order) => reconcilePendingOrderPayment(order)));
}

export async function getOrderById(id: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const profile = await getProfile();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(
        *,
        product:products(*),
        variant:product_variants(*)
      ),
      refunds:manual_refunds(
        id,
        amount,
        status,
        method,
        transfer_reference,
        created_at,
        paid_at
      ),
      payment_attempts:order_payment_attempts(
        id,
        provider,
        status,
        status_detail,
        amount,
        checkout_url,
        created_at,
        updated_at,
        transfer_notified_at,
        transfer_reviewed_at,
        transfer_reviewed_by,
        bank_reference
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;

  const orderOwnerId = data.clerk_user_id || data.profile_id;
  if (profile?.role !== "admin" && orderOwnerId !== userId) {
    throw new Error("Forbidden");
  }

  return reconcilePendingOrderPayment(data);
}

export async function getOrderForConfirmation(id: string, accessToken?: string) {
  const { userId } = await auth();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(
        *,
        product:products(*),
        variant:product_variants(*)
      ),
      refunds:manual_refunds(
        id,
        amount,
        status,
        method,
        transfer_reference,
        created_at,
        paid_at
      ),
      payment_attempts:order_payment_attempts(
        id,
        provider,
        status,
        status_detail,
        amount,
        checkout_url,
        created_at,
        updated_at,
        terminal_at,
        transfer_notified_at,
        transfer_reviewed_at,
        transfer_reviewed_by,
        bank_reference
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  if (userId) {
    const profile = await getProfile();
    const orderOwnerId = data.clerk_user_id || data.profile_id;
    if (profile?.role === "admin" || orderOwnerId === userId) {
      return reconcilePendingOrderPayment(data);
    }
  }

  if (
    accessToken &&
    data.guest_access_token &&
    secureTokenEquals(accessToken, data.guest_access_token)
  ) {
    return reconcilePendingOrderPayment(data);
  }

  throw new Error("Forbidden");
}

export async function updateOrderStatus(id: string, status: string) {
  await requireAdmin();
  assertValidOrderStatus(status);
  const supabase = getSupabaseAdmin();
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("status, stock_restored, shipping_method, mercadopago_id, mercadopago_status")
    .eq("id", id)
    .single();

  if (existingOrderError) {
    throw existingOrderError;
  }
  const { data: paymentAttempt, error: paymentAttemptError } = await supabase
    .from("order_payment_attempts")
    .select("id, provider, external_id, status, receiver_account_id")
    .eq("order_id", id)
    .in("status", ["approved", "pending", "in_process", "review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentAttemptError) throw paymentAttemptError;

  if (existingOrder.stock_restored && status !== "cancelled") {
    throw new Error("No se puede reabrir una orden con stock restaurado");
  }

  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["pending", "cancelled"],
    paid: ["paid", "ready_for_pickup", "shipped", "cancelled"],
    payment_review: ["payment_review", "cancelled"],
    ready_for_pickup: ["ready_for_pickup", "delivered", "cancelled"],
    shipped: ["shipped", "delivered", "cancelled"],
    delivered: ["delivered"],
    cancelled: ["cancelled"],
  };
  const currentStatus = existingOrder.status as OrderStatus;
  if (!allowedTransitions[currentStatus]?.includes(status)) {
    throw new Error("Ese cambio de estado no es válido para esta orden");
  }

  if (
    status === "ready_for_pickup" &&
    existingOrder.shipping_method === "local_delivery"
  ) {
    throw new Error("Una entrega local no puede quedar lista para retiro");
  }

  if (status === "shipped" && existingOrder.shipping_method !== "local_delivery") {
    throw new Error("Un pedido con retiro no puede marcarse en camino");
  }

  if (status === "cancelled") {
    if (
      paymentAttempt?.provider === "bank_transfer" &&
      paymentAttempt.status === "approved"
    ) {
      const { error: refundError } = await supabase.rpc(
        "create_order_bank_refund",
        { p_order_id: id }
      );
      if (refundError) throw new Error(refundError.message);
    } else if (paymentAttempt?.external_id) {
      const adapter = getPaymentAdapter(paymentAttempt.provider as PaymentProvider);
      if (
        ["approved", "review"].includes(paymentAttempt.status) ||
        ["paid", "payment_review", "ready_for_pickup", "shipped"].includes(currentStatus)
      ) {
        await adapter.refund(paymentAttempt.external_id, id);
        await supabase
          .from("order_payment_attempts")
          .update({ status: "refunded", terminal_at: new Date().toISOString() })
          .eq("id", paymentAttempt.id);
      } else if (paymentAttempt.receiver_account_id) {
        await adapter.cancel(paymentAttempt.external_id);
        await supabase
          .from("order_payment_attempts")
          .update({ status: "cancelled", terminal_at: new Date().toISOString() })
          .eq("id", paymentAttempt.id);
      } else {
        await supabase
          .from("order_payment_attempts")
          .update({ status: "cancelled", terminal_at: new Date().toISOString() })
          .eq("id", paymentAttempt.id);
      }
    }

    await restoreOrderStock(id);
  }

  const updatePayload: {
    status: OrderStatus;
    mercadopago_status?: string;
  } = { status };
  if (
    status === "cancelled" &&
    paymentAttempt?.provider === "mercadopago" &&
    (["approved", "review"].includes(paymentAttempt.status) ||
      ["paid", "payment_review", "ready_for_pickup", "shipped"].includes(currentStatus))
  ) {
    updatePayload.mercadopago_status = "refunded";
  }

  const { error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", id);

  if (error) throw error;
  const emailEvent =
    status === "ready_for_pickup"
      ? "ready-for-pickup"
      : status === "shipped"
        ? "shipped"
        : status === "delivered"
          ? "delivered"
          : status === "cancelled"
            ? "cancelled"
            : status === "payment_review"
              ? "payment-review"
              : status === "paid"
                ? "payment-approved"
                : null;
  if (emailEvent) {
    await sendOrderEmail(id, emailEvent).catch((notificationError) => {
      console.error("No se pudo enviar la notificación del pedido:", notificationError);
    });
  }
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${id}`);
}
