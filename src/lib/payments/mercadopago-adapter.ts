import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  cancelPayment,
  createPreference,
  expirePreference,
  getMercadoPagoAccountId,
  getPayment,
  refundPayment,
} from "@/lib/mercadopago/client";
import type {
  PaymentAdapter,
  ProviderPayment,
  StartPaymentInput,
} from "@/lib/payments/types";
import type { PaymentAttemptStatus } from "@/types";

function getAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
}

function splitStreet(value?: string | null) {
  const street = value?.trim() || "";
  const match = street.match(/^(.*?)(?:\s+(\d+))$/);
  return {
    name: match?.[1]?.trim() || street || undefined,
    number: match?.[2] ? Number(match[2]) : undefined,
  };
}

function mapStatus(status: string): PaymentAttemptStatus {
  if (
    [
      "pending",
      "in_process",
      "approved",
      "rejected",
      "cancelled",
      "refunded",
      "charged_back",
    ].includes(status)
  ) {
    return status as PaymentAttemptStatus;
  }
  return "failed";
}

export const mercadoPagoAdapter: PaymentAdapter = {
  provider: "mercadopago",

  isConfigured() {
    return Boolean(
      process.env.E2E_MERCADOPAGO_FAKE === "1" ||
        process.env.MERCADOPAGO_ACCESS_TOKEN
    );
  },

  validateWebhook({ externalId, requestId, signature }) {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret || !requestId || !signature) return false;
    const values = Object.fromEntries(
      signature.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key?.trim(), value?.trim()];
      })
    ) as { ts?: string; v1?: string };
    if (!values.ts || !values.v1 || !/^[a-f0-9]{64}$/i.test(values.v1)) {
      return false;
    }
    const timestamp = Number(values.ts);
    const timestampMs = timestamp >= 1_000_000_000_000
      ? timestamp
      : timestamp * 1000;
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      Math.abs(Date.now() - timestampMs) > 15 * 60 * 1000
    ) {
      return false;
    }
    const expected = createHmac("sha256", secret)
      .update(`id:${externalId};request-id:${requestId};ts:${values.ts};`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(values.v1, "hex");
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  },

  async start(input: StartPaymentInput) {
    const appUrl = getAppUrl();
    const names = input.buyer.name.trim().split(/\s+/);
    const street = splitStreet(input.buyer.street);
    const preference = await createPreference({
      items: [
        {
          id: input.orderId,
          title: `Pedido ${input.orderId.slice(0, 8).toUpperCase()}`,
          unit_price: input.amount,
          quantity: 1,
        },
      ],
      payer: {
        name: names[0] || input.buyer.name,
        surname: names.slice(1).join(" "),
        ...(input.buyer.email ? { email: input.buyer.email } : {}),
        phone: { number: input.buyer.phone },
        address: {
          ...(input.buyer.zip ? { zip_code: input.buyer.zip } : {}),
          ...(street.name ? { street_name: street.name } : {}),
          ...(street.number ? { street_number: street.number } : {}),
        },
      },
      ...(input.buyer.street
        ? {
            shipments: {
              mode: "not_specified",
              receiver_address: {
                ...(input.buyer.zip ? { zip_code: input.buyer.zip } : {}),
                ...(street.name ? { street_name: street.name } : {}),
                ...(street.number ? { street_number: street.number } : {}),
                ...(input.buyer.city ? { city_name: input.buyer.city } : {}),
                ...(input.buyer.state ? { state_name: input.buyer.state } : {}),
                country_name: "Argentina",
              },
            },
          }
        : {}),
      external_reference: input.orderId,
      metadata: { payment_attempt_id: input.attemptId },
      notification_url: `${appUrl}/api/webhooks/mercadopago?source_news=webhooks`,
      back_urls: {
        success: `${appUrl}/order-confirmation/${input.orderId}`,
        failure: `${appUrl}/order-confirmation/${input.orderId}`,
        pending: `${appUrl}/order-confirmation/${input.orderId}`,
      },
      auto_return: "approved",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: input.reservationExpiresAt,
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" },
          { id: "atm" },
          { id: "bank_transfer" },
        ],
      },
      statement_descriptor: "PILCHERIA GLORIA",
    }, input.attemptId, input.deviceId);

    const checkoutUrl = preference.init_point || preference.sandbox_init_point;
    if (!preference.id || !checkoutUrl) {
      throw new Error("Mercado Pago no devolvió un enlace de pago");
    }

    return {
      providerCheckoutId: String(preference.id),
      checkoutUrl: String(checkoutUrl),
      status: "pending" as const,
    };
  },

  async getPayment(externalId: string): Promise<ProviderPayment> {
    const payment = await getPayment(externalId);
    return {
      externalId: String(payment.id),
      orderId: String(payment.external_reference || ""),
      status: mapStatus(String(payment.status || "")),
      statusDetail: payment.status_detail ?? null,
      amount: Number(payment.transaction_amount),
      currency: String(payment.currency_id || ""),
      receiverAccountId: String(payment.collector_id || ""),
    };
  },

  async cancel(externalId: string) {
    await cancelPayment(externalId);
  },

  async expireCheckout(providerCheckoutId: string) {
    await expirePreference(providerCheckoutId);
  },

  async refund(externalId: string, orderId: string) {
    await refundPayment(externalId, orderId);
  },
};

export { getMercadoPagoAccountId };
