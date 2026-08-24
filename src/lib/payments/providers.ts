import "server-only";

import { mercadoPagoAdapter } from "@/lib/payments/mercadopago-adapter";
import type { PaymentAdapter } from "@/lib/payments/types";
import { viumiAdapter } from "@/lib/payments/viumi-adapter";
import type { PaymentProvider } from "@/types";
import { isBankTransferEnabled } from "@/lib/payments/bank-transfer";

const adapters: Record<Exclude<PaymentProvider, "bank_transfer">, PaymentAdapter> = {
  mercadopago: mercadoPagoAdapter,
  viumi: viumiAdapter,
};

export function getPaymentAdapter(provider: PaymentProvider) {
  if (provider === "bank_transfer") {
    throw new Error("La transferencia bancaria se procesa manualmente.");
  }
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

export async function getEnabledPaymentProviders(): Promise<PaymentProvider[]> {
  const providers: PaymentProvider[] = (Object.keys(adapters) as Array<Exclude<PaymentProvider, "bank_transfer">>).filter((provider) =>
    adapters[provider].isConfigured()
  );
  if (await isBankTransferEnabled().catch(() => false)) {
    providers.push("bank_transfer");
  }
  return providers;
}
