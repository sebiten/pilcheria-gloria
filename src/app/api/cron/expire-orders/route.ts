import { NextResponse } from "next/server";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import { hasCronSecret, isCronAuthorized } from "@/lib/cron/auth";
import { findMercadoPagoPaymentForOrder } from "@/lib/mercadopago/reconciliation";
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
const JOB_NAME = "expire-orders";

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
    .select("id, status, payment_attempts:order_payment_attempts(id, provider, status)")
    .in("status", ["pending", "payment_review"])
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
      const bankAttempt = (order.payment_attempts || []).find(
        (attempt: any) =>
          attempt.provider === "bank_transfer" &&
          ["pending", "review"].includes(attempt.status)
      );
      if (bankAttempt) {
        const reason =
          bankAttempt.status === "review"
            ? "Revisión de transferencia vencida sin resolver"
            : "Reserva de transferencia vencida sin aviso";
        const { data: cancelled, error: bankError } = await supabase.rpc(
          "reject_bank_transfer",
          {
            p_order_id: order.id,
            p_attempt_id: bankAttempt.id,
            p_reason: reason,
          }
        );
        if (bankError) throw bankError;
        if (cancelled) {
          await sendOrderEmail(order.id, "cancelled").catch(console.error);
          summary.expired += 1;
        }
        continue;
      }

      const selection = await findMercadoPagoPaymentForOrder(order.id);
      const payment = selection.payment;

      if (payment?.status && TERMINAL_PAYMENT_STATUSES.has(payment.status)) {
        const nextStatus = await applyMercadoPagoPayment(order.id, payment, {
          source: "expiration_cron",
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
  return runTrackedSweep(request);
}

export async function POST(request: Request) {
  return runTrackedSweep(request);
}

async function runTrackedSweep(request: Request) {
  if (!hasCronSecret() || !isCronAuthorized(request)) {
    return expireAbandonedOrders(request);
  }

  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const { data: run } = await supabase
    .from("cron_job_runs")
    .insert({
      job_name: JOB_NAME,
      source: request.headers.get("x-cron-source") || "external",
      status: "running",
      started_at: startedAt,
    })
    .select("id")
    .single();

  try {
    const response = await expireAbandonedOrders(request);
    const summary = await response.clone().json().catch(() => ({}));

    if (run?.id) {
      await supabase
        .from("cron_job_runs")
        .update({
          status: response.ok ? "succeeded" : "failed",
          summary,
          error_message: response.ok ? null : String(summary?.error || "HTTP error"),
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message.slice(0, 500) : "Error desconocido";
    if (run?.id) {
      await supabase
        .from("cron_job_runs")
        .update({
          status: "failed",
          error_message: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    console.error("Falló el barrido de reservas", {
      event: "cron.failed",
      route: "/api/cron/expire-orders",
      reason: errorMessage,
    });
    return NextResponse.json({ error: "Falló el barrido" }, { status: 500 });
  }
}
