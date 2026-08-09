import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getOrderForConfirmation } from "@/actions/orders";
import {
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/commerce";
import { ClearCartOnMount } from "./clear-cart-on-mount";

export const metadata: Metadata = {
  title: "Confirmación del pedido",
  robots: { index: false, follow: false },
};

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderConfirmationPageProps) {
  const { id } = await params;
  const { token } = await searchParams;
  let order;

  try {
    order = await getOrderForConfirmation(id, token);
  } catch {
    order = null;
  }

  return (
    <div className="container mx-auto px-4 py-16 text-center max-w-xl">
      <ClearCartOnMount />
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>

      <h1 className="mb-4 text-2xl font-bold">
        {order ? "¡Gracias por tu compra!" : "Pedido recibido"}
      </h1>

      {order ? (
        <div className="mb-8 text-left rounded-lg border p-6 text-left">
          <p className="mb-2">
            <strong>Número de pedido:</strong> {order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mb-2">
            <strong>Total:</strong> {formatPrice(Number(order.total))}
          </p>
          {Number(order.discount_total || 0) > 0 ? (
            <p className="mb-2">
              <strong>Descuento:</strong>{" "}
              {formatPrice(Number(order.discount_total))}
            </p>
          ) : null}
          <p className="mb-4">
            <strong>Estado:</strong>{" "}
            {getOrderStatusLabel(order.status, order.shipping_method)}
          </p>

          <p className="text-muted-foreground">
            {getOrderStatusDescription(order.status, order.shipping_method)}
          </p>
          {order.refund_status && order.refund_status !== "none" ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="font-semibold">
                {order.refund_status === "pending"
                  ? "Tenés una devolución pendiente"
                  : "La devolución ya fue transferida"}
              </p>
              <p className="mt-1 text-sm leading-6">
                {order.refund_status === "pending"
                  ? "Te contactaremos para solicitar tus datos bancarios y devolverte el importe de la prenda sin disponibilidad."
                  : `Importe transferido: ${formatPrice(Number(order.refunded_amount || 0))}.`}
              </p>
            </div>
          ) : null}
          {order.guest_access_token ? (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-semibold">
                Tu pedido está registrado aunque no tengas una cuenta.
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Guardá esta página y el código del pedido. Te contactaremos al
                WhatsApp que ingresaste para avisarte cuando esté listo. Si
                informaste un email, también recibirás las novedades allí.
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mb-8 text-muted-foreground">
          Tu pedido está siendo procesado. Te notificaremos cuando esté listo.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <Button asChild>
          <Link href="/products">Seguir comprando</Link>
        </Button>
        {!order?.guest_access_token ? (
          <Button variant="outline" asChild>
            <Link href="/account/orders">Ver mis pedidos</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
