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
const LATE_RECONCILIATION_INTERVAL_MINUTES = 10;
const LATE_RECONCILIATION_WINDOW_DAYS = 30;

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
    .select(
      "id, status, payment_attempts:order_payment_attempts(id, provider, status, status_detail)"
    )
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
    bankTransfersRequiringReview: 0,
    bankTransferReviewsEscalated: 0,
    bankTransferReviewsExpired: 0,
    paymentReviewsAwaitingAdmin: 0,
    cancelledPaymentChecks: 0,
    cancelledPaymentsEscalated: 0,
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
        if (bankAttempt.status === "review") {
          summary.bankTransfersRequiringReview += 1;
          const { data: result, error: reviewError } = await supabase.rpc(
            "process_expired_bank_transfer_review",
            {
              p_order_id: order.id,
              p_attempt_id: bankAttempt.id,
            }
          );
          if (reviewError) throw reviewError;
          if (result === "escalated") {
            summary.bankTransferReviewsEscalated += 1;
          } else if (result === "expired_stock_released") {
            summary.bankTransferReviewsExpired += 1;
          }
          continue;
        }

        const { data: cancelled, error: bankError } = await supabase.rpc(
          "reject_bank_transfer",
          {
            p_order_id: order.id,
            p_attempt_id: bankAttempt.id,
            p_reason: "Reserva de transferencia vencida sin aviso",
            p_reviewed_by: "system:expire-orders",
          }
        );
        if (bankError) throw bankError;
        if (cancelled) {
          await sendOrderEmail(order.id, "cancelled").catch(console.error);
          summary.expired += 1;
        }
        continue;
      }

      const mercadoPagoReview = (order.payment_attempts || []).find(
        (attempt: any) =>
          attempt.provider === "mercadopago" &&
          (attempt.status === "review" ||
            (attempt.status === "approved" &&
              (attempt.status_detail?.startsWith("late_approved:") ||
                attempt.status_detail?.startsWith("multiple_approved:"))))
      );
      if (order.status === "payment_review" && mercadoPagoReview) {
        summary.paymentReviewsAwaitingAdmin += 1;
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

  const lateCheckCutoff = new Date(
    Date.now() - LATE_RECONCILIATION_INTERVAL_MINUTES * 60 * 1000
  ).toISOString();
  const { data: lateAttempts, error: lateAttemptsError } = await supabase
    .from("order_payment_attempts")
    .select("id, order_id")
    .eq("provider", "mercadopago")
    .in("status", [
      "created",
      "pending",
      "in_process",
      "review",
      "rejected",
      "cancelled",
      "failed",
    ])
    .gt("late_reconciliation_until", new Date().toISOString())
    .or(`late_reconciled_at.is.null,late_reconciled_at.lte.${lateCheckCutoff}`)
    .order("late_reconciled_at", { ascending: true, nullsFirst: true })
    .limit(50);

  if (lateAttemptsError) throw lateAttemptsError;

  const lateOrderIds = Array.from(
    new Set((lateAttempts || []).map((attempt) => attempt.order_id))
  );
  const { data: cancelledOrders, error: cancelledOrdersError } = lateOrderIds.length
    ? await supabase
        .from("orders")
        .select("id")
        .in("id", lateOrderIds)
        .eq("status", "cancelled")
    : { data: [], error: null };

  if (cancelledOrdersError) throw cancelledOrdersError;
  const cancelledOrderIds = new Set(
    (cancelledOrders || []).map((order) => order.id)
  );

  for (const orderId of cancelledOrderIds) {
    try {
      const reconciledAt = new Date().toISOString();
      const { error: claimError } = await supabase
        .from("order_payment_attempts")
        .update({ late_reconciled_at: reconciledAt, updated_at: reconciledAt })
        .eq("order_id", orderId)
        .eq("provider", "mercadopago")
        .gt("late_reconciliation_until", reconciledAt);
      if (claimError) throw claimError;

      summary.cancelledPaymentChecks += 1;
      const selection = await findMercadoPagoPaymentForOrder(orderId);
      const payment = selection.payment;
      if (!payment) continue;
      if (["pending", "in_process"].includes(payment.status)) {
        const { error: extensionError } = await supabase
          .from("order_payment_attempts")
          .update({
            late_reconciliation_until: new Date(
              Date.now() + LATE_RECONCILIATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
          .eq("order_id", orderId)
          .eq("provider", "mercadopago");
        if (extensionError) throw extensionError;
        continue;
      }
      if (payment.status !== "approved") continue;

      const nextStatus = await applyMercadoPagoPayment(
        orderId,
        payment,
        {
          source: "expiration_cron",
          ambiguous: selection.ambiguous,
          candidatePaymentIds: selection.candidatePaymentIds,
        }
      );
      if (nextStatus !== "payment_review") {
        throw new Error(
          "Una aprobación conciliada después de cancelar no terminó en revisión"
        );
      }

      await sendOrderEmail(orderId, "payment-review").catch(
        (notificationError) => {
          console.error(
            "No se pudo notificar la aprobación posterior a la cancelación:",
            notificationError
          );
        }
      );
      summary.cancelledPaymentsEscalated += 1;
      summary.reconciled += 1;
    } catch (latePaymentError) {
      summary.failed += 1;
      console.error("No se pudo conciliar un pago posterior a la cancelación:", {
        orderId,
        error: latePaymentError,
      });
    }
  }

  if (
    summary.expired > 0 ||
    summary.reconciled > 0 ||
    summary.bankTransferReviewsExpired > 0
  ) {
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
