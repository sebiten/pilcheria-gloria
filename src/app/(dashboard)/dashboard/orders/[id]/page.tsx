import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderById } from "@/actions/orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variants";
import {
  getDeliveryMethodLabel,
  getOrderStatusLabel,
} from "@/lib/commerce";
import { OrderStatusForm } from "./order-status-form";
import { requireAdmin } from "@/actions/auth";
import { getStoreSettings } from "@/actions/store-settings";
import { markOrderItemCollected } from "@/actions/inventory";
import {
  getGoogleMapsDirectionsUrl,
  getPickupAddress,
  hasPickupAddress,
  PICKUP_LOCATION_REFERENCE,
} from "@/lib/maps";
import {
  isValidArgentinaContactPhone,
  normalizeArgentinaWhatsAppPhone,
} from "@/lib/contact";

interface DashboardOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DashboardOrderDetailPage({
  params,
}: DashboardOrderDetailPageProps) {
  await requireAdmin();
  const { id } = await params;

  const [order, settings] = await Promise.all([
    getOrderById(id).catch(() => null),
    getStoreSettings(),
  ]);

  if (!order) {
    notFound();
  }

  const shippingAddress = order.shipping_address as Record<string, string> | null;
  const rawCustomerPhone = shippingAddress?.phone || "";
  const customerPhone = isValidArgentinaContactPhone(rawCustomerPhone)
    ? normalizeArgentinaWhatsAppPhone(rawCustomerPhone)
    : "";
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const customerName = shippingAddress?.name?.trim().split(/\s+/)[0] || "";
  const greeting = customerName ? `Hola ${customerName}` : "Hola";
  const pickupAddress = getPickupAddress(settings);
  const pickupMapsUrl = hasPickupAddress(settings)
    ? getGoogleMapsDirectionsUrl(pickupAddress)
    : null;
  const guestOrderNotice = order.guest_access_token
    ? "\n\nEl pago fue procesado por Mercado Pago y tu pedido quedó registrado con este código. Aunque hayas comprado sin iniciar sesión, no necesitás crear una cuenta; te contactaremos usando el email o teléfono que ingresaste."
    : "";
  const canSendManualWhatsapp =
    (order.shipping_method !== "local_delivery" &&
      order.status === "ready_for_pickup") ||
    (order.shipping_method === "local_delivery" && order.status === "shipped");
  const notificationMessage =
    order.shipping_method === "local_delivery"
      ? `${greeting}, tu pedido ${orderCode} de Pilchería Gloria ya está en camino.${guestOrderNotice}`
      : `${greeting}, tu pedido ${orderCode} de Pilchería Gloria ya está listo para retirar.\n\nPunto de retiro: ${pickupAddress}.${pickupMapsUrl ? `\nCómo llegar: ${pickupMapsUrl}` : ""}\nReferencia: ${PICKUP_LOCATION_REFERENCE}\n\nMostrá el código ${orderCode} al retirarlo.${guestOrderNotice}`;
  const whatsappHref =
    customerPhone && canSendManualWhatsapp
      ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(notificationMessage)}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            Pedido {order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground">
            Creado el {new Date(order.created_at).toLocaleDateString("es-AR")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/orders">Volver</Link>
        </Button>
      </div>

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
            {order.reservation_expires_at && order.status === "pending" ? (
              <p>
                <strong>Reserva hasta:</strong>{" "}
                {new Date(order.reservation_expires_at).toLocaleString("es-AR")}
              </p>
            ) : null}
            {order.cancel_reason ? (
              <p>
                <strong>Motivo de cancelación:</strong> {order.cancel_reason}
              </p>
            ) : null}
            <div className="pt-3">
              <OrderStatusForm
                orderId={order.id}
                currentStatus={order.status}
                shippingMethod={order.shipping_method}
              />
            </div>
            {whatsappHref ? (
              <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-xs leading-5 text-green-900">
                  El aviso no se envía automáticamente. Revisá el mensaje y
                  presioná Enviar desde WhatsApp.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="border-green-300 bg-white"
                >
                  <Link href={whatsappHref} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 size-4" />
                    Avisar manualmente por WhatsApp
                  </Link>
                </Button>
              </div>
            ) : canSendManualWhatsapp ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                No se puede abrir WhatsApp porque el teléfono del cliente no
                tiene un formato válido con código de área.
              </p>
            ) : order.shipping_method !== "local_delivery" &&
              order.status === "paid" ? (
              <p className="text-xs leading-5 text-muted-foreground">
                El botón para avisar por WhatsApp aparecerá cuando marques el
                pedido como listo para retirar.
              </p>
            ) : null}
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
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="h-12 px-4 text-left font-medium">Producto</th>
                  <th className="h-12 px-4 text-left font-medium">Variante</th>
                  <th className="h-12 px-4 text-left font-medium">Cantidad</th>
                  <th className="h-12 px-4 text-left font-medium">Unitario</th>
                  <th className="h-12 px-4 text-left font-medium">Subtotal</th>
                  <th className="h-12 px-4 text-left font-medium">Origen</th>
                  <th className="h-12 px-4 text-left font-medium">Reparto</th>
                  <th className="h-12 px-4 text-left font-medium">Retiro</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: any) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-4">{item.product?.name || "Producto eliminado"}</td>
                    <td className="p-4">
                      {formatVariantLabel(item.variant)}
                    </td>
                    <td className="p-4">{item.quantity}</td>
                    <td className="p-4">{formatPrice(Number(item.unit_price))}</td>
                    <td className="p-4">
                      {formatPrice(Number(item.net_amount ?? Number(item.unit_price) * item.quantity))}
                      {Number(item.discount_allocated ?? 0) > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          -{formatPrice(Number(item.discount_allocated))} de cupón
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4">
                      {item.source_code === "grandma_store"
                        ? "Negocio de abuela"
                        : "Propio"}
                    </td>
                    <td className="p-4 text-xs">
                      <span className="block">Vos: {formatPrice(Number(item.seller_share ?? item.net_amount ?? 0))}</span>
                      {Number(item.partner_share ?? 0) > 0 ? (
                        <span className="block">Abuela: {formatPrice(Number(item.partner_share))}</span>
                      ) : null}
                    </td>
                    <td className="p-4">
                      {item.procurement_status === "pending_collection" ? (
                        <form action={markOrderItemCollected.bind(null, item.id)}>
                          <Button size="sm">Marcar retirada</Button>
                        </form>
                      ) : item.procurement_status === "collected" ? (
                        "Retirada"
                      ) : item.procurement_status === "awaiting_payment" ? (
                        "Espera pago"
                      ) : item.procurement_status === "cancelled" ? (
                        "Cancelada"
                      ) : (
                        "No requiere"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
