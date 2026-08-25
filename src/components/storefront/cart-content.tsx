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
  const {
    items,
    legacyVariantItems,
    removeItem,
    updateQuantity,
    getTotal,
    setIsOpen,
  } = useCartStore();
  const itemCount = getCartItemCount(items);
  const localDeliveryAvailable = canUseLocalDelivery(items);
  const hasInvalidItems = items.some((item) => {
    const selectedVariant = item.product?.variants?.find(
      (variant) => variant.id === item.variant_id
    );

    return Boolean(
      !item.product ||
        !selectedVariant ||
        selectedVariant.active === false ||
        !selectedVariant.available
    );
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-muted-foreground mb-4">
          {legacyVariantItems.length > 0
            ? "Tu carrito anterior tenía prendas sin talle. Volvé a elegir el talle para agregarlas nuevamente."
            : "Tu carrito está vacío"}
        </p>
        <Button asChild>
          <Link
            href={
              legacyVariantItems.length === 1 && legacyVariantItems[0].productSlug
                ? `/uniformes/${legacyVariantItems[0].productSlug}#elegir-talle`
                : "/uniformes"
            }
            onClick={() => setIsOpen(false)}
          >
            {legacyVariantItems.length > 0 ? "Volver a elegir talle" : "Ver uniformes"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {legacyVariantItems.length > 0 ? (
        <p
          className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm font-semibold leading-5 text-destructive"
          role="alert"
        >
          Quitamos {legacyVariantItems.length === 1 ? "una prenda" : "prendas"} de
          un carrito anterior porque no tenían talle. Volvé a elegirlo antes de comprar.
        </p>
      ) : null}
      <p
        className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-bold text-primary"
        role="status"
      >
        Listo, la prenda está en tu carrito.
      </p>
      <div className="flex-1 overflow-y-auto space-y-4">
        {items.map((item) => {
          const imageUrl =
            item.product?.images?.[0]?.url || "/pilcheria-gloria-facebook.png";
          const selectedVariant = item.product?.variants?.find(
            (variant) => variant.id === item.variant_id
          );
          const maxQuantity = selectedVariant
            ? (selectedVariant.maxQuantity ?? 10)
            : null;
          const hasReachedStockLimit =
            maxQuantity !== null && item.quantity >= maxQuantity;
          const isUnavailableVariant = Boolean(
            !item.product ||
              !selectedVariant ||
              selectedVariant.active === false ||
              !selectedVariant.available
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
                    {item.product?.slug ? (
                      <Link
                        href={`/uniformes/${item.product.slug}`}
                        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setIsOpen(false)}
                      >
                        {item.product.name}
                      </Link>
                    ) : (
                      "Producto no disponible"
                    )}
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
                    <div className="mt-1 text-sm">
                      <p className="font-semibold text-destructive">
                        Este talle ya no está disponible
                      </p>
                      {item.product?.slug ? (
                        <Link
                          href={`/uniformes/${item.product.slug}#elegir-talle`}
                          className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-4"
                          onClick={() => setIsOpen(false)}
                        >
                          Elegir otro talle
                        </Link>
                      ) : (
                        <p className="mt-1 text-muted-foreground">
                          Eliminá este producto para continuar.
                        </p>
                      )}
                    </div>
                  ) : null}
                  {selectedVariant && !isUnavailableVariant ? (
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
                          {item.product?.uniformPriceGroup
                            ? `${segment.quantity} prenda${segment.quantity === 1 ? "" : "s"} · `
                            : `${segment.quantity} × ${formatPrice(segment.unitPrice)} · `}
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
            ? "Tenés envío local gratis en Ledesma. También podés elegir retiro coordinado."
            : `Con ${itemCount} prenda podés retirar de forma coordinada. Sumá otra y tenés envío local gratis.`}
        </p>
        {hasInvalidItems ? (
          <>
            <p
              className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold leading-5 text-destructive"
              role="alert"
            >
              Revisá los productos marcados y elegí un talle disponible antes
              de continuar.
            </p>
            <Button
              className="min-h-12 w-full text-base font-bold"
              size="lg"
              data-testid="cart-checkout-link"
              disabled
            >
              Revisá los talles para continuar
            </Button>
          </>
        ) : (
          <div className="grid gap-2">
            <Button className="min-h-12 w-full text-base font-bold" size="lg" asChild>
              <Link
                href="/checkout"
                data-testid="cart-checkout-link"
                onClick={() => setIsOpen(false)}
              >
                Finalizar compra
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full font-bold"
              onClick={() => setIsOpen(false)}
            >
              Seguir eligiendo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
