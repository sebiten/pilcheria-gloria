import type { MercadoPagoPayment } from "@/lib/orders/payment-state";

export type MercadoPagoReconciliationSource =
  | "webhook"
  | "buyer_return"
  | "order_query"
  | "expiration_cron";

export type MercadoPagoPaymentCandidate = MercadoPagoPayment & {
  date_created?: string | null;
  date_last_updated?: string | null;
  metadata?: { payment_attempt_id?: string | null } | null;
};

export type MercadoPagoPaymentSelection = {
  payment: MercadoPagoPaymentCandidate | null;
  ambiguous: boolean;
  candidatePaymentIds: string[];
};

function getPaymentTimestamp(payment: MercadoPagoPaymentCandidate) {
  const timestamp = Date.parse(
    payment.date_last_updated || payment.date_created || ""
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function selectMercadoPagoPayment(
  payments: MercadoPagoPaymentCandidate[],
  activeAttempt?: { id: string; external_id: string | null } | null
): MercadoPagoPaymentSelection {
  const sorted = payments
    .filter((payment) => payment?.id != null && Boolean(payment.status))
    .sort(
      (first, second) =>
        getPaymentTimestamp(second) - getPaymentTimestamp(first) ||
        String(second.id).localeCompare(String(first.id))
    );
  const approved = sorted.filter((payment) => payment.status === "approved");
  const associated = activeAttempt
    ? sorted.find(
        (payment) =>
          String(payment.id) === activeAttempt.external_id ||
          payment.metadata?.payment_attempt_id === activeAttempt.id
      )
    : null;

  return {
    payment: approved[0] ?? associated ?? sorted[0] ?? null,
    ambiguous: approved.length > 1,
    candidatePaymentIds: sorted.map((payment) => String(payment.id)),
  };
}
