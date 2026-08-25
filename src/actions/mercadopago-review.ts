"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { requireAdmin } from "@/actions/auth";
import {
  getMercadoPagoAccountId,
  getPayment,
  refundPayment,
} from "@/lib/mercadopago/client";
import { sendMetaPurchaseEvent } from "@/lib/meta/conversions";
import { sendAdminSalePush } from "@/lib/notifications/admin-push";
import { sendOrderEmail } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const uuidSchema = z.string().uuid();
const paymentIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);

export async function resolveMercadoPagoPaymentReview(
  orderId: string,
  formData: FormData
) {
  await requireAdmin();
  const { userId } = await auth();
  if (!userId) throw new Error("Administrador no autenticado");
  const safeOrderId = uuidSchema.parse(orderId);
  const selectedPaymentId = paymentIdSchema.parse(
    formData.get("selectedPaymentId")?.toString()
  );
  const supabase = getSupabaseAdmin();

  const [{ data: order, error: orderError }, { data: review, error: reviewError }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total")
        .eq("id", safeOrderId)
        .single(),
      supabase
        .from("order_payment_reconciliation_events")
        .select("candidate_payment_ids")
        .eq("order_id", safeOrderId)
        .eq("ambiguous", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (orderError || !order) throw orderError ?? new Error("Pedido no encontrado");
  if (reviewError) throw reviewError;
  if (order.status !== "payment_review" || !review) {
    throw new Error("El pedido ya no tiene un pago múltiple pendiente de resolución");
  }

  const candidateIds = z.array(paymentIdSchema).min(2).parse(
    review.candidate_payment_ids
  );
  if (!candidateIds.includes(selectedPaymentId)) {
    throw new Error("El pago elegido no pertenece a esta revisión");
  }

  const claimToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_mercadopago_payment_review",
    {
      p_order_id: safeOrderId,
      p_selected_payment_id: selectedPaymentId,
      p_candidate_payment_ids: candidateIds,
      p_claim_token: claimToken,
      p_claimed_by: userId,
    }
  );
  if (claimError) throw new Error(claimError.message);
  if (!claimed) {
    throw new Error("Otro administrador ya está resolviendo estos pagos");
  }

  try {
    const payments = await Promise.all(candidateIds.map((id) => getPayment(id)));
    const selectedPayment = payments.find(
      (payment) => String(payment.id) === selectedPaymentId
    );
    if (!selectedPayment || selectedPayment.status !== "approved") {
      throw new Error("El pago elegido ya no figura aprobado en Mercado Pago");
    }

    const expectedAccountId = await getMercadoPagoAccountId();
    const selectedIsValid =
      selectedPayment.external_reference === safeOrderId &&
      Math.abs(Number(selectedPayment.transaction_amount) - Number(order.total)) <=
        0.01 &&
      selectedPayment.currency_id === "ARS" &&
      String(selectedPayment.collector_id ?? "") === expectedAccountId;
    if (!selectedIsValid) {
      throw new Error(
        "El pago elegido no coincide con la orden, el importe, la moneda o la cuenta receptora"
      );
    }

    const refunds = await Promise.allSettled(
      payments
        .filter(
          (payment) =>
            String(payment.id) !== selectedPaymentId &&
            payment.status === "approved"
        )
        .map((payment) => refundPayment(String(payment.id), safeOrderId))
    );
    const failedRefund = refunds.find((result) => result.status === "rejected");
    if (failedRefund?.status === "rejected") {
      throw new Error(
        `No se pudieron completar todas las devoluciones: ${
          failedRefund.reason instanceof Error
            ? failedRefund.reason.message
            : "error desconocido"
        }`
      );
    }

    const { data: changed, error: resolutionError } = await supabase.rpc(
      "resolve_mercadopago_payment_review",
      {
        p_order_id: safeOrderId,
        p_selected_payment_id: selectedPaymentId,
        p_receiver_account_id: String(selectedPayment.collector_id),
        p_candidate_payment_ids: candidateIds,
        p_claim_token: claimToken,
      }
    );
    if (resolutionError) throw new Error(resolutionError.message);
    if (!changed) {
      throw new Error("Mercado Pago no permitió confirmar el pago elegido");
    }

    await Promise.allSettled([
      sendOrderEmail(safeOrderId, "payment-approved"),
      sendAdminSalePush(safeOrderId),
      sendMetaPurchaseEvent(safeOrderId),
    ]);
    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${safeOrderId}`);
    revalidatePath(`/order-confirmation/${safeOrderId}`);
    revalidatePath("/account/orders");
  } catch (error) {
    await supabase
      .from("order_payment_review_resolutions")
      .update({
        status: "failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 500) : "Error desconocido",
      })
      .eq("order_id", safeOrderId)
      .eq("claim_token", claimToken)
      .eq("status", "resolving");
    throw error;
  }
}
