export type PaymentRejectionCategory =
  | "data"
  | "issuer"
  | "risk"
  | "other";

export const RISK_RETRY_COOLDOWN_MINUTES = 10;

const DATA_ERRORS = new Set([
  "cc_rejected_bad_filled_card_number",
  "cc_rejected_bad_filled_date",
  "cc_rejected_bad_filled_other",
  "cc_rejected_bad_filled_security_code",
]);

const ISSUER_ERRORS = new Set([
  "cc_rejected_call_for_authorize",
  "cc_rejected_card_disabled",
  "cc_rejected_duplicated_payment",
  "cc_rejected_insufficient_amount",
  "cc_rejected_invalid_installments",
  "cc_rejected_max_attempts",
]);

const RISK_ERRORS = new Set([
  "cc_rejected_blacklist",
  "cc_rejected_high_risk",
  "cc_rejected_other_reason",
]);

export function getPaymentRejectionCategory(
  statusDetail?: string | null
): PaymentRejectionCategory {
  if (statusDetail && DATA_ERRORS.has(statusDetail)) return "data";
  if (statusDetail && ISSUER_ERRORS.has(statusDetail)) return "issuer";
  if (statusDetail && RISK_ERRORS.has(statusDetail)) return "risk";
  return "other";
}

export function getPaymentRejectionHint(statusDetail?: string | null) {
  switch (getPaymentRejectionCategory(statusDetail)) {
    case "data":
      return "Revisá los datos de la tarjeta antes de volver a intentar.";
    case "issuer":
      return "El banco o los fondos disponibles no autorizaron este pago.";
    case "risk":
      return "Mercado Pago no autorizó esta operación. Usá otro medio de pago.";
    default:
      return "Podés volver a intentar con otro medio de pago.";
  }
}

export function getRiskRetryNotBefore(attempt?: {
  provider?: string | null;
  status?: string | null;
  status_detail?: string | null;
  terminal_at?: string | null;
  updated_at?: string | null;
}) {
  if (
    attempt?.provider !== "mercadopago" ||
    attempt.status !== "rejected" ||
    getPaymentRejectionCategory(attempt.status_detail) !== "risk"
  ) {
    return null;
  }

  const rejectedAt = new Date(
    attempt.terminal_at || attempt.updated_at || ""
  ).getTime();
  if (!Number.isFinite(rejectedAt)) return null;

  return new Date(
    rejectedAt + RISK_RETRY_COOLDOWN_MINUTES * 60 * 1000
  ).toISOString();
}
