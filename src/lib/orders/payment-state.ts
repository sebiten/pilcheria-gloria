import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMercadoPagoAccountId } from "@/lib/mercadopago/client";
import { sendAdminSalePush } from "@/lib/notifications/admin-push";
import { sendMetaPurchaseEvent } from "@/lib/meta/conversions";
import type { PaymentProvider } from "@/types";
import { logCommerceEvent } from "@/lib/logging";
import type { MercadoPagoReconciliationSource } from "@/lib/mercadopago/reconciliation-selection";
import { getPaymentAdapter } from "@/lib/payments/providers";
import {
  MONEY_TOLERANCE,
  ORDER_RESERVATION_MINUTES,
  PENDING_PAYMENT_EXTENSION_HOURS,
} from "@/lib/commerce/constants";

export { ORDER_RESERVATION_MINUTES, PENDING_PAYMENT_EXTENSION_HOURS };

export type MercadoPagoPayment = {
  id: string | number;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  collector_id?: string | number | null;
  metadata?: { payment_attempt_id?: string | null } | null;
};

export function getOrderReservationExpiration() {
  return new Date(
    Date.now() + ORDER_RESERVATION_MINUTES * 60 * 1000
  ).toISOString();
}

export async function reserveOrderStock(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("reserve_order_stock", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(error.message);
  }

}

export async function claimOrderCoupon(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("claim_order_coupon", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function cancelOrderAndRelease(
  orderId: string,
  reason: string,
  onlyIfPending = false
) {
  const supabase = getSupabaseAdmin();
  const { data: checkoutAttempt, error: checkoutAttemptError } = await supabase
    .from("order_payment_attempts")
    .select(
      "id, provider, provider_checkout_id, provider_checkout_invalidation_status"
    )
    .eq("order_id", orderId)
    .not("provider_checkout_id", "is", null)
    .in("status", ["created", "pending", "in_process", "review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkoutAttemptError) throw new Error(checkoutAttemptError.message);

  if (
    checkoutAttempt?.provider_checkout_id &&
    checkoutAttempt.provider_checkout_invalidation_status !== "succeeded"
  ) {
    const invalidationAt = new Date().toISOString();
    let invalidationStatus: "succeeded" | "failed" | "not_supported";
    let invalidationDetail: string | null = null;

    try {
      if (checkoutAttempt.provider === "bank_transfer") {
        invalidationStatus = "not_supported";
        invalidationDetail = "El proveedor no usa un checkout externo invalidable";
      } else {
        const adapter = getPaymentAdapter(checkoutAttempt.provider as PaymentProvider);
        await adapter.expireCheckout(checkoutAttempt.provider_checkout_id);
        invalidationStatus = "succeeded";
      }
    } catch (invalidationError) {
      invalidationStatus = "failed";
      invalidationDetail =
        invalidationError instanceof Error
          ? invalidationError.message.slice(0, 500)
          : "No se pudo invalidar el checkout externo";
    }

    const { error: invalidationPersistenceError } = await supabase
      .from("order_payment_attempts")
      .update({
        provider_checkout_invalidation_status: invalidationStatus,
        provider_checkout_invalidation_detail: invalidationDetail,
        provider_checkout_invalidation_at: invalidationAt,
        updated_at: invalidationAt,
      })
      .eq("id", checkoutAttempt.id);

    if (invalidationPersistenceError) {
      await recordPaymentPersistenceFailure({
        orderId,
        attemptId: checkoutAttempt.id,
        provider: checkoutAttempt.provider,
        providerCheckoutId: checkoutAttempt.provider_checkout_id,
        operation: "expire_checkout",
        error: invalidationPersistenceError,
      });
      throw new Error(invalidationPersistenceError.message);
    }
  }

  const { data, error } = await supabase.rpc("cancel_order_and_release", {
    p_order_id: orderId,
    p_reason: reason,
    p_only_if_pending: onlyIfPending,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    const now = new Date().toISOString();
    const { error: attemptsError } = await supabase
      .from("order_payment_attempts")
      .update({ status: "cancelled", terminal_at: now, updated_at: now })
      .eq("order_id", orderId)
      .in("status", ["created", "pending", "in_process", "review"]);
    if (attemptsError) throw new Error(attemptsError.message);
  }

  return Boolean(data);
}

export async function recordPaymentPersistenceFailure({
  orderId,
  attemptId,
  provider,
  externalId,
  providerCheckoutId,
  operation,
  error,
}: {
  orderId: string;
  attemptId?: string;
  provider: string;
  externalId?: string | null;
  providerCheckoutId?: string | null;
  operation: string;
  error: unknown;
}) {
  const supabase = getSupabaseAdmin();
  const detail =
    error instanceof Error ? error.message.slice(0, 500) : "Error de persistencia";
  const results = await Promise.allSettled([
    supabase.from("payment_flow_events").insert({
      event_name: "payment.persistence_failed",
      order_id: orderId,
      attempt_id: attemptId ?? null,
      provider,
      external_id: externalId ?? null,
      provider_checkout_id: providerCheckoutId ?? null,
      route: "server_recovery",
      failure_reason: detail,
      metadata: { operation, requires_admin_review: true },
    }),
    supabase.from("admin_notifications").upsert(
      { order_id: orderId, event_key: "payment_persistence_failure" },
      { onConflict: "order_id,event_key", ignoreDuplicates: true }
    ),
  ]);

  for (const result of results) {
    if (result.status === "rejected" || result.value.error) {
      console.error("No se pudo registrar una falla recuperable de pago", result);
    }
  }

  logCommerceEvent({
    event: "payment.persistence_failed",
    route: operation,
    orderId,
    attemptId,
    provider,
    externalId,
    providerCheckoutId,
    reason: error,
  });
}

export async function applyMercadoPagoPayment(
  orderId: string,
  payment: MercadoPagoPayment,
  reconciliation: {
    source: MercadoPagoReconciliationSource;
    ambiguous?: boolean;
    candidatePaymentIds?: string[];
  }
) {
  const supabase = getSupabaseAdmin();

  if (payment.external_reference && payment.external_reference !== orderId) {
    throw new Error("La referencia externa del pago no coincide con la orden");
  }

  if (payment.status === "approved") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("total")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw orderError ?? new Error("Orden no encontrada");
    }

    const expectedAccountId = await getMercadoPagoAccountId();
    const amountMatches =
      Number.isFinite(Number(payment.transaction_amount)) &&
      Math.abs(Number(payment.transaction_amount) - Number(order.total)) <=
      MONEY_TOLERANCE;
    const currencyMatches = payment.currency_id === "ARS";
    const collectorMatches =
      String(payment.collector_id ?? "") === expectedAccountId;

    if (!amountMatches || !currencyMatches || !collectorMatches) {
      return applyProviderPayment(orderId, "mercadopago", {
        ...payment,
        status: "review",
        status_detail:
          "Pago recibido con importe, moneda o cuenta receptora inconsistente",
      }, reconciliation);
    }
  }

  return applyProviderPayment(orderId, "mercadopago", payment, reconciliation);
}

export async function applyProviderPayment(
  orderId: string,
  provider: PaymentProvider,
  payment: MercadoPagoPayment,
  reconciliation?: {
    source: MercadoPagoReconciliationSource;
    ambiguous?: boolean;
    candidatePaymentIds?: string[];
  }
) {
  const supabase = getSupabaseAdmin();
  const externalId = String(payment.id);
  const { data: attempts, error: attemptsError } = await supabase
    .from("order_payment_attempts")
    .select("id, external_id, provider_checkout_id, status, created_at")
    .eq("order_id", orderId)
    .eq("provider", provider)
    .order("created_at", { ascending: false });

  if (attemptsError) throw new Error(attemptsError.message);
  const attempt =
    attempts?.find((item) => item.external_id === externalId) ??
    attempts?.find(
      (item) => item.id === payment.metadata?.payment_attempt_id
    ) ??
    attempts?.find((item) =>
      ["created", "pending", "in_process", "review"].includes(item.status)
    ) ??
    (payment.status === "approved" ? attempts?.[0] : undefined);
  if (!attempt) {
    throw new Error("No existe un intento activo para este pago");
  }

  const rpcName =
    provider === "mercadopago" && reconciliation
      ? "reconcile_order_payment_attempt"
      : "apply_order_payment_attempt";
  const { data, error } = await supabase.rpc(rpcName, {
    p_order_id: orderId,
    p_attempt_id: attempt.id,
    p_provider: provider,
    p_external_id: externalId,
    p_payment_status: payment.status,
    p_payment_status_detail: payment.status_detail ?? null,
    p_receiver_account_id: payment.collector_id
      ? String(payment.collector_id)
      : null,
    ...(reconciliation
      ? {
          p_source: reconciliation.source,
          p_ambiguous: reconciliation.ambiguous ?? false,
          p_candidate_payment_ids: reconciliation.candidatePaymentIds ?? [externalId],
        }
      : {}),
  });

  if (error) {
    throw new Error(error.message);
  }

  logCommerceEvent({
    event: "payment.status_changed",
    route: reconciliation?.source || "payment-state/apply-provider-payment",
    orderId,
    attemptId: attempt.id,
    provider,
    previousStatus: attempt.status,
    newStatus: payment.status,
    externalId,
  });

  if (String(data) === "paid") {
    const [pushResult, metaResult] = await Promise.allSettled([
      sendAdminSalePush(orderId),
      sendMetaPurchaseEvent(orderId),
    ]);
    if (pushResult.status === "rejected") {
      console.error("No se pudo enviar el aviso push de la venta:", pushResult.reason);
    }
    if (metaResult.status === "rejected") {
      console.error("No se pudo registrar la compra en Meta:", metaResult.reason);
    }
  }

  return String(data);
}

export async function extendPendingPaymentReservation(
  orderId: string,
  payment: MercadoPagoPayment
) {
  const supabase = getSupabaseAdmin();
  const reservationExpiresAt = new Date(
    Date.now() + PENDING_PAYMENT_EXTENSION_HOURS * 60 * 60 * 1000
  ).toISOString();
  const now = new Date().toISOString();
  const attemptStatus = ["pending", "in_process"].includes(payment.status)
    ? payment.status
    : "pending";
  const { error: attemptError } = await supabase
    .from("order_payment_attempts")
    .update({
      external_id: String(payment.id),
      status: attemptStatus,
      status_detail: payment.status_detail ?? null,
      updated_at: now,
    })
    .eq("order_id", orderId)
    .eq("provider", "mercadopago")
    .in("status", ["created", "pending", "in_process"]);

  if (attemptError) {
    throw new Error(attemptError.message);
  }

  const { error } = await supabase
    .from("orders")
    .update({
      mercadopago_id: String(payment.id),
      mercadopago_status: attemptStatus,
      mercadopago_status_detail: payment.status_detail ?? null,
      reservation_expires_at: reservationExpiresAt,
    })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }
}
