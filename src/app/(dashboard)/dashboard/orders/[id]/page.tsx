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
import {
  markOrderItemCollected,
  markOrderItemUnavailable,
} from "@/actions/inventory";
import { ConfirmSubmitButton } from "@/components/dashboard/confirm-submit-button";
import { approveBankTransfer, rejectBankTransfer } from "@/actions/bank-transfer";
import { resolveMercadoPagoPaymentReview } from "@/actions/mercadopago-review";
import { Input } from "@/components/ui/input";
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
  const guestOrderNotice =
    order.guest_access_token_hash || order.guest_access_token
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
  const bankAttempt = [...(order.payment_attempts || [])]
    .sort(
      (first: any, second: any) =>
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    )
    .find((attempt: any) => attempt.provider === "bank_transfer");
  const mercadoPagoAttempt = [...(order.payment_attempts || [])]
    .sort(
      (first: any, second: any) =>
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    )
    .find((attempt: any) => attempt.provider === "mercadopago");
  const ambiguousPaymentReview = [...(order.reconciliation_events || [])]
    .sort(
      (first: any, second: any) =>
        new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    )
    .find(
      (event: any) =>
        event.ambiguous &&
        Array.isArray(event.candidate_payment_ids) &&
        event.candidate_payment_ids.length > 1
    );
  const candidatePaymentIds = ambiguousPaymentReview
    ? (ambiguousPaymentReview.candidate_payment_ids as string[])
    : [];
  const bankReviewOverdue = Boolean(
    bankAttempt?.status === "review" &&
      order.reservation_expires_at &&
      new Date(order.reservation_expires_at).getTime() <= Date.now()
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Pedido {order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground">
            Creado el {new Date(order.created_at).toLocaleDateString("es-AR")}
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
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
              <strong>Mercado Pago:</strong> {mercadoPagoAttempt?.status || "Pendiente"}
            </p>
            {order.refund_status && order.refund_status !== "none" ? (
              <p>
                <strong>Devolución:</strong>{" "}
                {order.refund_status === "pending"
                  ? "Transferencia pendiente"
                  : `${formatPrice(Number(order.refunded_amount || 0))} transferidos`}
              </p>
            ) : null}
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
              {order.status === "payment_review" && ambiguousPaymentReview ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950">
                  Resolvé los pagos múltiples antes de cambiar o cancelar el pedido.
                </p>
              ) : (
                <OrderStatusForm
                  orderId={order.id}
                  currentStatus={order.status}
                  shippingMethod={order.shipping_method}
                />
              )}
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
                  className="min-h-11 w-full border-green-300 bg-white sm:w-auto"
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

      {order.status === "payment_review" && ambiguousPaymentReview ? (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle>Pagos múltiples de Mercado Pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold leading-6 text-red-950">
              Revisá cada movimiento directamente en Mercado Pago. Al elegir uno,
              el sistema volverá a validarlo, devolverá los demás pagos aprobados
              y sólo después confirmará el pedido.
            </p>
            <div className="grid gap-3">
              {candidatePaymentIds.map((paymentId) => (
                <form
                  key={paymentId}
                  action={resolveMercadoPagoPaymentReview.bind(null, order.id)}
                  className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      ID de pago candidato
                    </p>
                    <p className="mt-1 break-all font-mono font-bold">{paymentId}</p>
                  </div>
                  <input type="hidden" name="selectedPaymentId" value={paymentId} />
                  <ConfirmSubmitButton
                    className="min-h-11 sm:w-auto"
                    confirmation={`¿Confirmás que verificaste el pago ${paymentId} en Mercado Pago? Los otros pagos aprobados serán devueltos.`}
                  >
                    Conservar este pago
                  </ConfirmSubmitButton>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {bankAttempt ? (
        <Card className="border-amber-300">
          <CardHeader><CardTitle>Transferencia bancaria</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p><strong>Método:</strong> Transferencia bancaria</p>
              <p><strong>Importe:</strong> {formatPrice(Number(bankAttempt.amount))}</p>
              <p><strong>Estado:</strong> {bankAttempt.status === "review" ? "Avisada · en revisión" : bankAttempt.status}</p>
              <p><strong>Fecha del aviso:</strong> {bankAttempt.transfer_notified_at ? new Date(bankAttempt.transfer_notified_at).toLocaleString("es-AR") : "Sin aviso"}</p>
              {bankAttempt.bank_reference ? <p><strong>Referencia bancaria:</strong> {bankAttempt.bank_reference}</p> : null}
              {bankAttempt.transfer_reviewed_at ? <p><strong>Confirmada:</strong> {new Date(bankAttempt.transfer_reviewed_at).toLocaleString("es-AR")}</p> : null}
            </div>
            <p className="rounded-xl border border-red-300 bg-red-50 p-3 font-semibold leading-6 text-red-950">
              Nunca apruebes una transferencia solo por una captura. Verificá el movimiento acreditado en la cuenta y que coincidan importe y titular.
            </p>
            {bankReviewOverdue ? (
              <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 font-semibold leading-6 text-amber-950">
                El plazo de revisión venció. La transferencia sigue reservada y requiere una decisión manual; no se cancelará automáticamente.
              </p>
            ) : null}
            {bankAttempt.status === "review" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <form action={approveBankTransfer.bind(null, order.id, bankAttempt.id)} className="space-y-2 rounded-xl border p-3">
                  <label htmlFor="bankReference" className="font-semibold">Referencia bancaria (opcional)</label>
                  <Input id="bankReference" name="bankReference" maxLength={200} placeholder="ID o referencia del movimiento" />
                  <ConfirmSubmitButton className="min-h-11 w-full" confirmation="¿Confirmaste la acreditación directamente en la cuenta bancaria?">
                    Confirmar acreditación
                  </ConfirmSubmitButton>
                </form>
                <form action={rejectBankTransfer.bind(null, order.id, bankAttempt.id)} className="rounded-xl border p-3">
                  <p className="mb-3 leading-6 text-muted-foreground">Cancela el pedido, libera stock y restaura el cupón una sola vez.</p>
                  <ConfirmSubmitButton variant="outline" className="min-h-11 w-full text-destructive" confirmation="¿Confirmás que la transferencia no fue recibida?">
                    Transferencia no recibida
                  </ConfirmSubmitButton>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="admin-responsive-table overflow-hidden">
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
                    <td className="p-4 font-medium" data-primary="true">{item.product?.name || "Producto eliminado"}</td>
                    <td className="p-4" data-label="Variante">
                      {formatVariantLabel(item.variant)}
                    </td>
                    <td className="p-4" data-label="Cantidad">{item.quantity}</td>
                    <td className="p-4" data-label="Unitario">{formatPrice(Number(item.unit_price))}</td>
                    <td className="p-4" data-label="Subtotal">
                      {formatPrice(Number(item.net_amount ?? Number(item.unit_price) * item.quantity))}
                      {Number(item.discount_allocated ?? 0) > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          -{formatPrice(Number(item.discount_allocated))} de cupón
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4" data-label="Origen">
                      {item.source_code === "grandma_store"
                        ? "Negocio de abuela"
                        : "Propio"}
                    </td>
                    <td className="p-4 text-xs" data-label="Reparto">
                      <span className="block">Vos: {formatPrice(Number(item.seller_share ?? item.net_amount ?? 0))}</span>
                      {Number(item.partner_share ?? 0) > 0 ? (
                        <span className="block">Abuela: {formatPrice(Number(item.partner_share))}</span>
                      ) : null}
                    </td>
                    <td className="p-4" data-actions="true" data-label="Retiro">
                      {item.procurement_status === "pending_collection" ? (
                        <div className="grid gap-2">
                          <form action={markOrderItemCollected.bind(null, item.id)}>
                            <Button className="min-h-11 w-full">Marcar retirada</Button>
                          </form>
                          <form action={markOrderItemUnavailable.bind(null, item.id)}>
                            <ConfirmSubmitButton
                              variant="outline"
                              className="min-h-11 w-full text-destructive hover:text-destructive"
                              confirmation="Se creará una devolución pendiente por transferencia. ¿Continuar?"
                            >
                              No disponible
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      ) : item.procurement_status === "collected" ? (
                        "Retirada"
                      ) : item.procurement_status === "unavailable" ? (
                        "Sin disponibilidad · devolución"
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
