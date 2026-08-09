"use client";

import { useCartStore } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import {
  canUseLocalDelivery,
  getCartItemCount,
  getCartItemLineTotal,
  getCartItemPricingSegments,
} from "@/lib/commerce";
import { formatStorefrontVariantSize } from "@/lib/inventory";

export function CartContent() {
  const { items, removeItem, updateQuantity, getTotal, setIsOpen } = useCartStore();
  const itemCount = getCartItemCount(items);
  const localDeliveryAvailable = canUseLocalDelivery(items);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-muted-foreground mb-4">Tu carrito está vacío</p>
        <Button asChild>
          <Link href="/products" onClick={() => setIsOpen(false)}>
            Ver productos
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4">
        {items.map((item) => {
          const imageUrl =
            item.product?.images?.[0]?.url || "/pilcheria-gloria-facebook.png";
          const selectedVariant = item.variant_id
            ? item.product?.variants?.find((variant) => variant.id === item.variant_id)
            : null;
          const maxQuantity = selectedVariant
            ? (selectedVariant.maxQuantity ?? 10)
            : null;
          const hasReachedStockLimit =
            maxQuantity !== null && item.quantity >= maxQuantity;
          const isUnavailableVariant = Boolean(
            item.variant_id && (!selectedVariant || !selectedVariant.available)
          );
          const pricing = getCartItemPricingSegments(item);

          return (
            <div key={`${item.product_id}-${item.variant_id}`} className="flex gap-4">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                <Image
                  src={imageUrl}
                  alt={item.product?.name || "Producto"}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <h4 className="line-clamp-2 text-base font-bold leading-5">
                    {item.product?.name}
                  </h4>
                  {selectedVariant ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Talle {formatStorefrontVariantSize(selectedVariant)}
                      {selectedVariant.color
                        ? `, ${selectedVariant.color}`
                        : ""}
                    </p>
                  ) : null}
                  {isUnavailableVariant ? (
                    <p className="text-sm text-destructive">
                      Variante no disponible
                    </p>
                  ) : null}
                  {selectedVariant ? (
                    <p className="text-sm text-muted-foreground">
                      {selectedVariant.stock > 0
                        ? "Entrega inmediata para el stock disponible"
                        : "Preparación en 24–48 horas"}
                    </p>
                  ) : null}
                  {pricing.segments.length > 1 ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {pricing.segments.map((segment, index) => (
                        <p
                          key={`${segment.fulfillment}-${segment.unitPrice}-${index}`}
                        >
                          {segment.quantity} × {formatPrice(segment.unitPrice)} ·{" "}
                          {segment.fulfillment === "immediate"
                            ? "inmediata"
                            : "24–48 h"}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label="Restar una unidad"
                      onClick={() =>
                        updateQuantity(item.product_id, item.variant_id, item.quantity - 1)
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label="Sumar una unidad"
                      onClick={() =>
                        updateQuantity(item.product_id, item.variant_id, item.quantity + 1)
                      }
                      disabled={hasReachedStockLimit || isUnavailableVariant}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-sm font-medium">
                    {formatPrice(getCartItemLineTotal(item))}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground hover:text-destructive"
                aria-label={`Eliminar ${item.product?.name || "producto"} del carrito`}
                onClick={() => removeItem(item.product_id, item.variant_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="border-t pt-4 mt-4 space-y-4">
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span>{formatPrice(getTotal())}</span>
        </div>
        <p className="rounded-xl bg-primary/5 p-3 text-sm font-semibold leading-5 text-foreground">
          {localDeliveryAvailable
            ? "Entrega local en Ledesma habilitada. También podés elegir retiro coordinado."
            : `Con ${itemCount} prenda: retiro coordinado. Sumá otra para habilitar entrega local en Ledesma.`}
        </p>
        <Button className="min-h-12 w-full text-base font-bold" size="lg" asChild>
          <Link
            href="/checkout"
            data-testid="cart-checkout-link"
            onClick={() => setIsOpen(false)}
          >
            Finalizar compra
          </Link>
        </Button>
      </div>
    </div>
  );
}
