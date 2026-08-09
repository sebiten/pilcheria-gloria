import type { CartItem, ProductVariant } from "@/types";
import {
  getVariantPricingSegments,
  getVariantQuantityTotal,
} from "@/lib/inventory";

interface ShippingSettings {
  localDeliveryCost?: number;
}

export const LOCAL_DELIVERY_MIN_ITEMS = 2;

export function getCartItemCount(
  items: ReadonlyArray<Pick<CartItem, "quantity">>
) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function canUseLocalDelivery(
  items: ReadonlyArray<Pick<CartItem, "quantity">>
) {
  return getCartItemCount(items) >= LOCAL_DELIVERY_MIN_ITEMS;
}

export function getVariantPrice(
  basePrice: number,
  variant?: Pick<ProductVariant, "priceOverride"> | null
) {
  return Number(variant?.priceOverride ?? basePrice);
}

export function getCartItemVariant(item: CartItem) {
  if (!item.variant_id || !item.product?.variants) {
    return null;
  }

  return item.product.variants.find((variant) => variant.id === item.variant_id) ?? null;
}

export function getCartItemUnitPrice(item: CartItem) {
  const basePrice = Number(item.product?.basePrice ?? 0);
  const variant = getCartItemVariant(item);
  return getVariantPrice(basePrice, variant);
}

export function getCartItemLineTotal(item: CartItem) {
  const variant = getCartItemVariant(item);
  return variant?.pricingTiers?.length
    ? getVariantQuantityTotal(variant, item.quantity)
    : getCartItemUnitPrice(item) * item.quantity;
}

export function getCartItemPricingSegments(item: CartItem) {
  const variant = getCartItemVariant(item);
  if (!variant?.pricingTiers?.length) {
    const unitPrice = getCartItemUnitPrice(item);
    return {
      fulfilled: true,
      missingQuantity: 0,
      segments: [
        {
          unitPrice,
          availableQuantity: item.quantity,
          fulfillment: "immediate" as const,
          quantity: item.quantity,
          lineTotal: unitPrice * item.quantity,
        },
      ],
    };
  }

  return getVariantPricingSegments(variant, item.quantity);
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((total, item) => total + getCartItemLineTotal(item), 0);
}

export function getShippingCost(
  shippingMethod: string,
  settings?: ShippingSettings
) {
  return shippingMethod === "local_delivery"
    ? Number(settings?.localDeliveryCost ?? 0)
    : 0;
}

export function getDeliveryMethodLabel(method?: string | null) {
  return method === "local_delivery" ? "Entrega local" : "Retiro coordinado";
}

export function getOrderStatusLabel(
  status: string,
  shippingMethod?: string | null
) {
  switch (status) {
    case "pending":
      return "Pendiente de pago";
    case "paid":
      return shippingMethod === "local_delivery"
        ? "Preparando entrega"
        : "Preparando retiro";
    case "payment_review":
      return "Pago en revisión";
    case "ready_for_pickup":
      return "Listo para retirar";
    case "shipped":
      return "En camino";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

export function getOrderStatusDescription(
  status: string,
  shippingMethod?: string | null
) {
  switch (status) {
    case "pending":
      return "Estamos esperando la confirmación del pago.";
    case "paid":
      return shippingMethod === "local_delivery"
        ? "El pago está confirmado y estamos preparando tu entrega."
        : "El pago está confirmado. Te avisaremos cuando el pedido esté listo.";
    case "payment_review":
      return "Recibimos el pago, pero necesitamos verificar el stock antes de confirmar la preparación.";
    case "ready_for_pickup":
      return "Tu pedido ya está preparado. Retiralo mostrando el código de compra.";
    case "shipped":
      return "Tu pedido salió para entrega.";
    case "delivered":
      return "El pedido fue entregado.";
    case "cancelled":
      return "El pedido fue cancelado.";
    default:
      return "";
  }
}
