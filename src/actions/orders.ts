"use server";

import { auth } from "@clerk/nextjs/server";
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureUserProfile, getProfile, requireAdmin } from "@/actions/auth";
import { findMercadoPagoPaymentForOrder } from "@/lib/mercadopago/reconciliation";
import { revalidatePath } from "next/cache";
import type { OrderStatus, ShippingAddress } from "@/types";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import {
  applyMercadoPagoPayment,
  cancelOrderAndRelease,
  recordPaymentPersistenceFailure,
} from "@/lib/orders/payment-state";
import { sendOrderEmail } from "@/lib/notifications/email";
import {
  assertCheckoutRouteCapability,
  type CheckoutRouteCapability,
} from "@/lib/security/checkout-capability";
import {
  guestAccessTokenMatches,
} from "@/lib/orders/confirmation-access";
import { getPaymentAdapter } from "@/lib/payments/providers";
import type { PaymentProvider } from "@/types";
import type { StartedPayment } from "@/lib/payments/types";
import {
  getRiskRetryNotBefore,
  RISK_RETRY_COOLDOWN_MINUTES,
} from "@/lib/orders/payment-rejection";
import { logCommerceEvent } from "@/lib/logging";
import { z } from "zod";
import { isOrderStatus } from "@/lib/commerce/constants";
import { getAllowedOrderStatusTransitions } from "@/lib/orders/status";

function assertValidOrderStatus(status: string): asserts status is OrderStatus {
  if (!isOrderStatus(status)) {
    throw new Error("Estado de orden invalido");
  }
}

type CheckoutItem = {
  product_id: string;
  variant_id: string;
  quantity: number;
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

function createGuestAccessToken(checkoutRequestId: string) {
  const secret =
    process.env.ORDER_ACCESS_TOKEN_SECRET ||
    process.env.CHECKOUT_RATE_LIMIT_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Falta configurar la seguridad del acceso a pedidos");
  }
  return createHmac("sha256", secret)
    .update(`order-access:${checkoutRequestId}`)
    .digest("hex");
}

function revalidateProductCacheAfterStockChange() {
  try {
    revalidateProductCacheFromRouteHandler();
  } catch (error) {
    console.error("Error revalidando cache de productos:", error);
  }
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
  const mercadoPagoAttempt = order.payment_attempts?.find(
    (attempt: any) =>
      attempt.provider === "mercadopago" && Boolean(attempt.external_id)
  );
  if (order.status !== "pending" || mercadoPagoAttempt) {
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
    const selection = await findMercadoPagoPaymentForOrder(order.id);
    const payment = selection.payment;

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

    const nextStatus = await applyMercadoPagoPayment(order.id, payment, {
      source: "order_query",
      ambiguous: selection.ambiguous,
      candidatePaymentIds: selection.candidatePaymentIds,
    });
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

export async function createOrder(
  {
    items,
    shippingMethod,
    shippingAddress,
    couponCode,
    expectedSubtotal,
    expectedDiscount,
    expectedShippingCost,
    expectedTotal,
    checkoutRequestId,
    requestFingerprint,
    analyticsSessionId,
  }: {
    items: CheckoutItem[];
    shippingMethod: string;
    shippingAddress: ShippingAddress;
    couponCode?: string;
    expectedSubtotal: number;
    expectedDiscount: number;
    expectedShippingCost: number;
    expectedTotal: number;
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
  const guestAccessToken = userId
    ? null
    : createGuestAccessToken(checkoutRequestId);
  const { data: order, error: orderError } = await supabase.rpc(
    "create_checkout_order",
    {
      p_checkout_id: checkoutRequestId,
      p_clerk_user_id: userId ?? null,
      p_guest_access_token: guestAccessToken,
      p_request_fingerprint: requestFingerprint,
      p_items: items,
      p_shipping_method: shippingMethod,
      p_shipping_address: shippingAddress,
      p_coupon_code: couponCode ?? null,
      p_expected_subtotal: expectedSubtotal,
      p_expected_discount: expectedDiscount,
      p_expected_shipping_cost: expectedShippingCost,
      p_expected_total: expectedTotal,
      p_analytics_session_id: analyticsSessionId ?? null,
      p_allow_demo_products: profile?.role === "admin",
      p_bypass_store_readiness:
        process.env.E2E_MERCADOPAGO_FAKE === "1" || profile?.role === "admin",
    }
  );

  if (orderError || !order) {
    throw new Error(orderError?.message || "No se pudo crear el pedido");
  }

  logCommerceEvent({
    event: "order.created",
    route: "actions/orders#createOrder",
    orderId: order.id,
    newStatus: order.status,
  });

  revalidateProductCacheAfterStockChange();
  await sendOrderEmail(order.id, "order-created").catch((notificationError) => {
    console.error("No se pudo enviar el email de reserva:", notificationError);
  });

  return { order, guestAccessToken };
}

export async function startOrderPayment(
  orderId: string,
  provider: PaymentProvider,
  capability: CheckoutRouteCapability,
  deviceId?: string | null
) {
  assertCheckoutRouteCapability(capability);
  const { userId } = await auth();
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
    await clearUserCart(userId).catch((cartError) => {
      console.error("No se pudo limpiar el carrito después de iniciar el pago:", cartError);
    });
    return bankAttempt;
  }

  if (currentAttempt?.provider === "bank_transfer") {
    throw new Error(
      "Los datos bancarios ya fueron informados. No inicies otro pago para este pedido."
    );
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
      await clearUserCart(userId).catch((cartError) => {
        console.error("No se pudo limpiar el carrito después de iniciar el pago:", cartError);
      });
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

  let startedPayment: StartedPayment | null = null;
  try {
    startedPayment = await adapter.start({
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
        provider_checkout_id: startedPayment.providerCheckoutId,
        checkout_url: startedPayment.checkoutUrl,
        status: startedPayment.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("status", "created")
      .select()
      .single();

    if (updateError || !updatedAttempt) {
      throw updateError ?? new Error("No se pudo guardar el enlace de pago");
    }
    await clearUserCart(userId).catch((cartError) => {
      console.error("No se pudo limpiar el carrito después de iniciar el pago:", cartError);
    });
    return updatedAttempt;
  } catch (error) {
    const invalidationAt = new Date().toISOString();
    let invalidationStatus: "succeeded" | "failed" | null = null;
    let invalidationDetail: string | null = null;
    if (startedPayment) {
      try {
        await adapter.expireCheckout(startedPayment.providerCheckoutId);
        invalidationStatus = "succeeded";
      } catch (invalidationError) {
        invalidationStatus = "failed";
        invalidationDetail =
          invalidationError instanceof Error
            ? invalidationError.message.slice(0, 500)
            : "No se pudo invalidar el checkout externo";
      }
    }
    const { error: failurePersistenceError } = await supabase
      .from("order_payment_attempts")
      .update({
        provider_checkout_id: startedPayment?.providerCheckoutId ?? null,
        status: "failed",
        status_detail:
          error instanceof Error ? error.message.slice(0, 300) : "Error desconocido",
        terminal_at: invalidationAt,
        updated_at: invalidationAt,
        provider_checkout_invalidation_status: invalidationStatus,
        provider_checkout_invalidation_detail: invalidationDetail,
        provider_checkout_invalidation_at: startedPayment ? invalidationAt : null,
      })
      .eq("id", attempt.id)
      .eq("status", "created");
    if (failurePersistenceError) {
      await recordPaymentPersistenceFailure({
        orderId,
        attemptId: attempt.id,
        provider,
        providerCheckoutId: startedPayment?.providerCheckoutId,
        operation: "start_payment_failed",
        error: failurePersistenceError,
      });
    }
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
        external_id,
        provider_checkout_id,
        status,
        status_detail,
        amount,
        checkout_url,
        created_at,
        updated_at,
        transfer_notified_at,
        transfer_reviewed_at,
        transfer_reviewed_by,
        bank_reference,
        review_deadline_at,
        review_max_deadline_at,
        review_escalated_at,
        review_resolution,
        review_notes,
        proof_reference,
        provider_checkout_invalidation_status,
        provider_checkout_invalidation_detail,
        provider_checkout_invalidation_at
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
        external_id,
        provider_checkout_id,
        status,
        status_detail,
        amount,
        checkout_url,
        created_at,
        updated_at,
        transfer_notified_at,
        transfer_reviewed_at,
        transfer_reviewed_by,
        bank_reference,
        review_deadline_at,
        review_max_deadline_at,
        review_escalated_at,
        review_resolution,
        review_notes,
        proof_reference,
        provider_checkout_invalidation_status,
        provider_checkout_invalidation_detail,
        provider_checkout_invalidation_at
      ),
      reconciliation_events:order_payment_reconciliation_events(
        id,
        source,
        payment_id,
        payment_status,
        ambiguous,
        candidate_payment_ids,
        created_at
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
        external_id,
        provider_checkout_id,
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
        bank_reference,
        review_deadline_at,
        review_max_deadline_at,
        review_escalated_at,
        review_resolution,
        review_notes,
        proof_reference,
        provider_checkout_invalidation_status,
        provider_checkout_invalidation_detail,
        provider_checkout_invalidation_at
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
    guestAccessTokenMatches(
      accessToken,
      data.guest_access_token_hash,
      data.guest_access_token
    )
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
    .select("status, stock_restored, shipping_method")
    .eq("id", id)
    .single();

  if (existingOrderError) {
    throw existingOrderError;
  }
  const { data: paymentAttempt, error: paymentAttemptError } = await supabase
    .from("order_payment_attempts")
    .select(
      "id, provider, external_id, provider_checkout_id, status, receiver_account_id"
    )
    .eq("order_id", id)
    .in("status", ["approved", "pending", "in_process", "review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentAttemptError) throw paymentAttemptError;

  if (existingOrder.stock_restored && status !== "cancelled") {
    throw new Error("No se puede reabrir una orden con stock restaurado");
  }

  const currentStatus = existingOrder.status as OrderStatus;
  if (currentStatus === "payment_review" && status === "cancelled") {
    const { data: ambiguousReview, error: ambiguousReviewError } = await supabase
      .from("order_payment_reconciliation_events")
      .select("id")
      .eq("order_id", id)
      .eq("ambiguous", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ambiguousReviewError) throw ambiguousReviewError;
    if (ambiguousReview) {
      throw new Error(
        "Resolvé los pagos múltiples antes de cancelar este pedido"
      );
    }
  }
  if (
    !getAllowedOrderStatusTransitions(
      currentStatus,
      existingOrder.shipping_method
    ).includes(status)
  ) {
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
        const { error: persistenceError } = await supabase
          .from("order_payment_attempts")
          .update({
            status: "refunded",
            terminal_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentAttempt.id);
        if (persistenceError) {
          await recordPaymentPersistenceFailure({
            orderId: id,
            attemptId: paymentAttempt.id,
            provider: paymentAttempt.provider,
            externalId: paymentAttempt.external_id,
            operation: "refund_payment",
            error: persistenceError,
          });
          throw new Error(persistenceError.message);
        }
      } else if (paymentAttempt.receiver_account_id) {
        await adapter.cancel(paymentAttempt.external_id);
        const { error: persistenceError } = await supabase
          .from("order_payment_attempts")
          .update({
            status: "cancelled",
            terminal_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentAttempt.id);
        if (persistenceError) {
          await recordPaymentPersistenceFailure({
            orderId: id,
            attemptId: paymentAttempt.id,
            provider: paymentAttempt.provider,
            externalId: paymentAttempt.external_id,
            operation: "cancel_payment",
            error: persistenceError,
          });
          throw new Error(persistenceError.message);
        }
      } else {
        const { error: persistenceError } = await supabase
          .from("order_payment_attempts")
          .update({
            status: "cancelled",
            terminal_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", paymentAttempt.id);
        if (persistenceError) throw new Error(persistenceError.message);
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

export async function fulfillLateApprovedOrder(id: string) {
  await requireAdmin();
  const orderId = z.string().uuid().parse(id);
  const { userId } = await auth();
  if (!userId) throw new Error("Administrador no autenticado");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("fulfill_late_approved_order", {
    p_order_id: orderId,
    p_reviewed_by: userId,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo reservar el stock para el pago tardío");

  await Promise.allSettled([
    sendOrderEmail(orderId, "payment-approved"),
  ]);
  revalidateProductCacheAfterStockChange();
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath(`/order-confirmation/${orderId}`);
}
