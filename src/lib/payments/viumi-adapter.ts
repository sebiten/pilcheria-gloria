import "server-only";

import type { PaymentAdapter } from "@/lib/payments/types";

const NOT_AVAILABLE =
  "viüMi todavía no está habilitado: faltan credenciales de prueba y documentación de API Checkout verificable.";

export const viumiAdapter: PaymentAdapter = {
  provider: "viumi",
  isConfigured() {
    return false;
  },
  validateWebhook() {
    return false;
  },
  async start() {
    throw new Error(NOT_AVAILABLE);
  },
  async getPayment() {
    throw new Error(NOT_AVAILABLE);
  },
  async cancel() {
    throw new Error(NOT_AVAILABLE);
  },
  async refund() {
    throw new Error(NOT_AVAILABLE);
  },
};
