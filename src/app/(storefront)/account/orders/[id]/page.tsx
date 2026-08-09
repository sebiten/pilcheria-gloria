import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderById } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variants";
import {
  getDeliveryMethodLabel,
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/commerce";

interface AccountOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountOrderDetailPage({
  params,
}: AccountOrderDetailPageProps) {
  const { id } = await params;

  let order = null;
  try {
    order = await getOrderById(id);
  } catch {
    order = null;
  }

  if (!order) {
    notFound();
  }

  const shippingAddress = order.shipping_address as Record<string, string> | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Pedido {order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground">
            Creado el {new Date(order.created_at).toLocaleDateString("es-AR")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/account/orders">Volver a mis pedidos</Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
        <p className="font-bold">
          {getOrderStatusLabel(order.status, order.shipping_method)}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {getOrderStatusDescription(order.status, order.shipping_method)}
        </p>
        {order.status === "ready_for_pickup" &&
        shippingAddress?.references ? (
          <p className="mt-3 text-sm font-medium">
            {shippingAddress.references}
          </p>
        ) : null}
      </div>

      {order.refund_status && order.refund_status !== "none" ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <p className="font-bold">
            {order.refund_status === "pending"
              ? "Devolución por transferencia pendiente"
              : "Devolución por transferencia realizada"}
          </p>
          <p className="mt-1 text-sm leading-6">
            {order.refund_status === "pending"
              ? "Una prenda no estaba disponible. Te contactaremos para pedirte los datos bancarios y devolverte su importe."
              : `Ya transferimos ${formatPrice(Number(order.refunded_amount || 0))}.`}
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Estado:</strong>{" "}
              {getOrderStatusLabel(order.status, order.shipping_method)}
            </p>
            <p>
              <strong>Total:</strong> {formatPrice(Number(order.total))}
            </p>
            {Number(order.discount_total || 0) > 0 ? (
              <p>
                <strong>Descuento:</strong>{" "}
                {formatPrice(Number(order.discount_total))}
                {order.coupon_code ? ` (${order.coupon_code})` : ""}
              </p>
            ) : null}
            <p>
              <strong>Envío:</strong> {formatPrice(Number(order.shipping_cost || 0))}
            </p>
            <p>
              <strong>Método:</strong>{" "}
              {getDeliveryMethodLabel(order.shipping_method)}
            </p>
            <p>
              <strong>Mercado Pago:</strong> {order.mercadopago_status || "Pendiente"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {order.shipping_method === "local_delivery"
                ? "Dirección de entrega"
                : "Datos para el retiro"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{shippingAddress?.name || "Sin nombre"}</p>
            <p>{shippingAddress?.email || "Sin email"}</p>
            <p>{shippingAddress?.phone || "Sin telefono"}</p>
            {order.shipping_method === "local_delivery" ? (
              <>
                <p>{shippingAddress?.street || "Sin calle"}</p>
                <p>
                  {[shippingAddress?.city, shippingAddress?.state, shippingAddress?.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.items?.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="h-12 px-4 text-left font-medium">Producto</th>
                      <th className="h-12 px-4 text-left font-medium">Variante</th>
                      <th className="h-12 px-4 text-left font-medium">Cantidad</th>
                      <th className="h-12 px-4 text-left font-medium">Unitario</th>
                      <th className="h-12 px-4 text-left font-medium">Subtotal</th>
                      <th className="h-12 px-4 text-left font-medium">Preparación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item: any) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-4">{item.product?.name || "Producto eliminado"}</td>
                        <td className="p-4">
                          {formatVariantLabel(item.variant)}
                        </td>
                        <td className="p-4">{item.quantity}</td>
                        <td className="p-4">{formatPrice(Number(item.unit_price))}</td>
                        <td className="p-4">
                          {formatPrice(Number(item.unit_price) * item.quantity)}
                        </td>
                        <td className="p-4">
                          {item.availability_mode === "on_demand"
                            ? item.procurement_status === "unavailable"
                              ? "Sin disponibilidad · devolución"
                              : "24–48 horas"
                            : "Entrega inmediata"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {order.items.map((item: any) => (
                  <div key={item.id} className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">
                      {item.product?.name || "Producto eliminado"}
                    </p>
                    <p className="text-muted-foreground">
                      Variante:{" "}
                      {formatVariantLabel(item.variant)}
                    </p>
                    <p className="text-muted-foreground">Cantidad: {item.quantity}</p>
                    <p className="text-muted-foreground">
                      Unitario: {formatPrice(Number(item.unit_price))}
                    </p>
                    <p className="text-muted-foreground">
                      {item.availability_mode === "on_demand"
                        ? item.procurement_status === "unavailable"
                          ? "Sin disponibilidad · devolución"
                          : "Preparación en 24–48 horas"
                        : "Entrega inmediata"}
                    </p>
                    <p className="mt-2 font-medium">
                      Subtotal: {formatPrice(Number(item.unit_price) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este pedido no tiene items visibles.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
