import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getMercadoPagoAccountId } from "@/lib/mercadopago/client";
import { sendAdminSalePush } from "@/lib/notifications/admin-push";

export const ORDER_RESERVATION_MINUTES = 30;
export const PENDING_PAYMENT_EXTENSION_HOURS = 24;

export type MercadoPagoPayment = {
  id: string | number;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  collector_id?: string | number | null;
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
  const { data, error } = await supabase.rpc("cancel_order_and_release", {
    p_order_id: orderId,
    p_reason: reason,
    p_only_if_pending: onlyIfPending,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function applyMercadoPagoPayment(
  orderId: string,
  payment: MercadoPagoPayment
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
      Math.abs(Number(payment.transaction_amount) - Number(order.total)) <= 0.01;
    const currencyMatches = payment.currency_id === "ARS";
    const collectorMatches =
      String(payment.collector_id ?? "") === expectedAccountId;

    if (!amountMatches || !currencyMatches || !collectorMatches) {
      const { error: reviewError } = await supabase
        .from("orders")
        .update({
          status: "payment_review",
          mercadopago_id: String(payment.id),
          mercadopago_status: payment.status,
          cancel_reason:
            "Pago recibido con importe, moneda o cuenta receptora inconsistente",
        })
        .eq("id", orderId)
        .in("status", ["pending", "payment_review"]);

      if (reviewError) {
        throw new Error(reviewError.message);
      }

      return "payment_review";
    }
  }

  const { data, error } = await supabase.rpc("apply_order_payment", {
    p_order_id: orderId,
    p_payment_id: String(payment.id),
    p_payment_status: payment.status,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (String(data) === "paid") {
    await sendAdminSalePush(orderId).catch((notificationError) => {
      console.error("No se pudo enviar el aviso push de la venta:", notificationError);
    });
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
  const { error } = await supabase
    .from("orders")
    .update({
      mercadopago_id: String(payment.id),
      mercadopago_status: payment.status,
      reservation_expires_at: reservationExpiresAt,
    })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }
}
