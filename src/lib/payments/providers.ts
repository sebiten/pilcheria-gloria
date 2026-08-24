import "server-only";

import { mercadoPagoAdapter } from "@/lib/payments/mercadopago-adapter";
import type { PaymentAdapter } from "@/lib/payments/types";
import { viumiAdapter } from "@/lib/payments/viumi-adapter";
import type { PaymentProvider } from "@/types";

const adapters: Record<PaymentProvider, PaymentAdapter> = {
  mercadopago: mercadoPagoAdapter,
  viumi: viumiAdapter,
};

export function getPaymentAdapter(provider: PaymentProvider) {
  const adapter = adapters[provider];
  if (!adapter.isConfigured()) {
    throw new Error(
      provider === "viumi"
        ? "viüMi todavía no está habilitado para pagos automáticos."
        : "Mercado Pago no está configurado."
    );
  }
  return adapter;
}

export function getEnabledPaymentProviders(): PaymentProvider[] {
  return (Object.keys(adapters) as PaymentProvider[]).filter((provider) =>
    adapters[provider].isConfigured()
  );
}
