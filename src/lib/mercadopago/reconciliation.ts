import "server-only";

import { searchPaymentsByExternalReference } from "@/lib/mercadopago/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  selectMercadoPagoPayment,
  type MercadoPagoPaymentCandidate,
} from "@/lib/mercadopago/reconciliation-selection";

export type {
  MercadoPagoPaymentCandidate,
  MercadoPagoPaymentSelection,
  MercadoPagoReconciliationSource,
} from "@/lib/mercadopago/reconciliation-selection";

export async function findMercadoPagoPaymentForOrder(
  orderId: string,
  observedPayment?: MercadoPagoPaymentCandidate | null
) {
  const supabase = getSupabaseAdmin();
  const [{ data: activeAttempt, error: attemptError }, paymentSearch] =
    await Promise.all([
      supabase
        .from("order_payment_attempts")
        .select("id, external_id")
        .eq("order_id", orderId)
        .eq("provider", "mercadopago")
        .in("status", ["created", "pending", "in_process", "review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      searchPaymentsByExternalReference(orderId),
    ]);

  if (attemptError) throw new Error(attemptError.message);
  const searchedPayments = Array.isArray(paymentSearch?.results)
    ? (paymentSearch.results as MercadoPagoPaymentCandidate[])
    : [];
  const payments = observedPayment
    ? [
        observedPayment,
        ...searchedPayments.filter(
          (payment) => String(payment.id) !== String(observedPayment.id)
        ),
      ]
    : searchedPayments;
  return selectMercadoPagoPayment(payments, activeAttempt);
}
