"use client";

import { useRef, useState } from "react";
import { CreditCard, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryPaymentButton({ orderId }: { orderId: string }) {
  const requestId = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const retryPayment = async () => {
    setError("");
    setIsLoading(true);
    requestId.current ??= crypto.randomUUID();

    try {
      const response = await fetch(
        `/api/order-confirmation/${encodeURIComponent(orderId)}/retry`,
        {
          method: "POST",
          headers: { "Idempotency-Key": requestId.current },
        }
      );
      const data = await response.json();

      if (!response.ok || !data.preference?.init_point) {
        if (response.status !== 429) requestId.current = null;
        throw new Error(data.error || "No se pudo preparar el nuevo pago.");
      }

      window.location.assign(data.preference.init_point);
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
      <Button
        className="min-h-12 w-full"
        type="button"
        onClick={retryPayment}
        disabled={isLoading}
      >
        {isLoading ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <CreditCard className="size-4" />
        )}
        {isLoading ? "Preparando el pago…" : "Probar otro medio de pago"}
      </Button>
      {error ? (
        <p className="mt-3 text-sm font-semibold leading-5 text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
