"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/actions/orders";
import type { OrderStatus } from "@/types";
import { Button } from "@/components/ui/button";

interface OrderStatusFormProps {
  orderId: string;
  currentStatus: OrderStatus;
  shippingMethod: string | null;
}

export function OrderStatusForm({
  orderId,
  currentStatus,
  shippingMethod,
}: OrderStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const labels: Record<OrderStatus, string> = {
    pending: "Pendiente de pago",
    paid: "Pagada / por preparar",
    payment_review: "Pago en revisión",
    ready_for_pickup: "Lista para retirar",
    shipped: "En camino",
    delivered: "Entregada",
    cancelled: "Cancelada",
  };
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["pending", "cancelled"],
    paid: [
      "paid",
      shippingMethod === "local_delivery" ? "shipped" : "ready_for_pickup",
      "cancelled",
    ],
    payment_review: ["payment_review", "cancelled"],
    ready_for_pickup: ["ready_for_pickup", "delivered", "cancelled"],
    shipped: ["shipped", "delivered", "cancelled"],
    delivered: ["delivered"],
    cancelled: ["cancelled"],
  };
  const statusOptions = transitions[currentStatus].map((value) => ({
    value,
    label: labels[value],
  }));

  const handleSubmit = () => {
    if (
      status === "cancelled" &&
      ["paid", "ready_for_pickup", "shipped"].includes(currentStatus) &&
      !window.confirm(
        "Esta acción devolverá el pago completo en Mercado Pago y restaurará el stock. ¿Querés continuar?"
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(orderId, status);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo actualizar el estado"
        );
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus)}
          className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm sm:w-auto"
          disabled={isPending}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button className="min-h-11 w-full sm:w-auto" onClick={handleSubmit} disabled={isPending || status === currentStatus}>
          {isPending ? "Guardando..." : "Actualizar estado"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
