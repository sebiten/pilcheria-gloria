"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PaymentProvider } from "@/types";
import {
  getMercadoPagoDeviceId,
  MercadoPagoDeviceIdScript,
} from "@/components/storefront/mercadopago-device-id";

export function RetryPaymentButton({
  orderId,
  providers,
  previousProvider,
  riskRetryNotBefore,
}: {
  orderId: string;
  providers: PaymentProvider[];
  previousProvider?: PaymentProvider | null;
  riskRetryNotBefore?: string | null;
}) {
  const defaultProvider =
    providers.find((provider) => provider !== previousProvider) ??
    providers[0] ??
    "mercadopago";
  const requestId = useRef<string | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>(defaultProvider);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(0);
  const retryAt = riskRetryNotBefore
    ? new Date(riskRetryNotBefore).getTime()
    : 0;
  const isCoolingDown =
    provider === "mercadopago" &&
    previousProvider === "mercadopago" &&
    retryAt > now;
  const remainingMinutes = isCoolingDown
    ? Math.max(1, Math.ceil((retryAt - now) / 60_000))
    : 0;

  useEffect(() => {
    setNow(Date.now());
    if (!retryAt || retryAt <= Date.now()) return;
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  const retryPayment = async () => {
    setError("");
    setIsLoading(true);
    requestId.current ??= crypto.randomUUID();

    try {
      const response = await fetch(
        `/api/order-confirmation/${encodeURIComponent(orderId)}/retry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestId.current,
          },
          body: JSON.stringify({
            paymentProvider: provider,
            deviceId:
              provider === "mercadopago"
                ? getMercadoPagoDeviceId()
                : null,
          }),
        }
      );
      const data = await response.json();
      const checkoutUrl = data.payment?.checkoutUrl || data.preference?.init_point;

      if (!response.ok || !checkoutUrl) {
        if (response.status !== 429) requestId.current = null;
        throw new Error(data.error || "No se pudo preparar el nuevo pago.");
      }

      window.location.assign(checkoutUrl);
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : "No se pudo preparar el nuevo pago."
      );
      setIsLoading(false);
    }
  };

  return (
    <div>
      {providers.includes("mercadopago") ? (
        <MercadoPagoDeviceIdScript />
      ) : null}
      {providers.length > 1 ? (
        <RadioGroup
          value={provider}
          onValueChange={(value) => {
            requestId.current = null;
            setProvider(value as PaymentProvider);
          }}
          className="mb-4 grid grid-cols-2 gap-3"
          aria-label="Procesador para el nuevo intento"
        >
          {providers.map((item) => (
            <div key={item}>
              <RadioGroupItem value={item} id={`retry-${item}`} className="peer sr-only" />
              <Label
                htmlFor={`retry-${item}`}
                className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border p-3 font-bold peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
              >
                {item === "mercadopago"
                  ? "Mercado Pago"
                  : item === "bank_transfer"
                    ? "Transferencia"
                    : "viüMi"}
              </Label>
            </div>
          ))}
        </RadioGroup>
      ) : null}
      <Button
        className="min-h-12 w-full"
        type="button"
        onClick={retryPayment}
        disabled={isLoading || providers.length === 0 || isCoolingDown}
      >
        {isLoading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <CreditCard className="size-4" />
        )}
        {isLoading
          ? "Preparando el pago…"
          : provider === "bank_transfer"
            ? "Reservar y ver datos de transferencia"
            : `Pagar con ${provider === "mercadopago" ? "Mercado Pago" : "viüMi"}`}
      </Button>
      {isCoolingDown ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-5 text-amber-950">
          Por seguridad, esperá {remainingMinutes} min antes de volver a intentar
          con Mercado Pago. Si aparece otro procesador, podés elegirlo ahora.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-semibold leading-5 text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
