import { NextResponse } from "next/server";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import { hasCronSecret, isCronAuthorized } from "@/lib/cron/auth";
import { searchPaymentsByExternalReference } from "@/lib/mercadopago/client";
import {
  applyMercadoPagoPayment,
  cancelOrderAndRelease,
  extendPendingPaymentReservation,
} from "@/lib/orders/payment-state";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendOrderEmail } from "@/lib/notifications/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TERMINAL_PAYMENT_STATUSES = new Set([
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
]);

async function expireAbandonedOrders(request: Request) {
  if (!hasCronSecret()) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 503 }
    );
  }

  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .lte("reservation_expires_at", new Date().toISOString())
    .order("reservation_expires_at", { ascending: true })
    .limit(50);

  if (error) {
    throw error;
  }

  const summary = {
    checked: orders?.length ?? 0,
    expired: 0,
    reconciled: 0,
    extended: 0,
    failed: 0,
  };

  for (const order of orders || []) {
    try {
      const paymentSearch = await searchPaymentsByExternalReference(order.id);
      const payments = Array.isArray(paymentSearch?.results)
        ? paymentSearch.results
        : [];
      const payment =
        payments.find((item: { status?: string }) => item.status === "approved") ??
        payments.find((item: { status?: string }) =>
          item.status ? TERMINAL_PAYMENT_STATUSES.has(item.status) : false
        ) ??
        payments.find((item: { status?: string }) => Boolean(item.status));

      if (payment?.status && TERMINAL_PAYMENT_STATUSES.has(payment.status)) {
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
            console.error("No se pudo notificar la conciliación automática:", notificationError);
          });
        }
        if (
          nextStatus === "pending" &&
          ["rejected", "cancelled"].includes(payment.status)
        ) {
          const cancelled = await cancelOrderAndRelease(
            order.id,
            "Reserva vencida después de un pago rechazado",
            true
          );
          if (cancelled) summary.expired += 1;
        }
        summary.reconciled += 1;
        continue;
      }

      if (payment?.status) {
        await extendPendingPaymentReservation(order.id, payment);
        summary.extended += 1;
        continue;
      }

      const cancelled = await cancelOrderAndRelease(
        order.id,
        "Reserva vencida sin pago",
        true
      );
      if (cancelled) {
        await sendOrderEmail(order.id, "cancelled").catch((notificationError) => {
          console.error("No se pudo notificar la reserva vencida:", notificationError);
        });
        summary.expired += 1;
      }
    } catch (orderError) {
      summary.failed += 1;
      console.error("No se pudo conciliar una reserva vencida:", {
        orderId: order.id,
        error: orderError,
      });
    }
  }

  if (summary.expired > 0 || summary.reconciled > 0) {
    revalidateProductCacheFromRouteHandler();
  }

  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return expireAbandonedOrders(request);
}

export async function POST(request: Request) {
  return expireAbandonedOrders(request);
}
