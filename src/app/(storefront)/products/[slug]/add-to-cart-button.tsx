"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ProductWithDetails, ProductVariant, SizeSystem } from "@/types";
import { formatPrice } from "@/lib/utils";
import { PaymentConfidence } from "@/components/storefront/payment-confidence";
import {
  formatStorefrontVariantSize,
  getVariantPricingSegments,
  getVariantQuantityTotal,
} from "@/lib/inventory";

interface AddToCartButtonProps {
  product: ProductWithDetails;
  whatsappPhone?: string | null;
  productUrl?: string;
}

function variantKey(variant: ProductVariant) {
  return `${variant.sizeSystem ?? "none"}:${variant.size.trim().toLocaleLowerCase("es-AR")}:${variant.color?.trim().toLocaleLowerCase("es-AR") ?? ""}`;
}

type VariantGroup = SizeSystem | "other";

function getVariantGroup(variant: ProductVariant): VariantGroup {
  return variant.sizeSystem ?? "other";
}

function getVariantGroupLabel(group: VariantGroup) {
  if (group === "infant") return "Primaria";
  if (group === "adult") return "Secundaria";
  return "Otros talles";
}

export function AddToCartButton({
  product,
  whatsappPhone,
  productUrl: providedProductUrl,
}: AddToCartButtonProps) {
  const variants = useMemo(() => {
    const unique = new Map<string, ProductVariant>();

    for (const variant of product.variants ?? []) {
      const key = variantKey(variant);
      const existing = unique.get(key);
      if (
        !existing ||
        (variant.active !== false && variant.available && !existing.available)
      ) {
        unique.set(key, variant);
      }
    }

    return Array.from(unique.values()).sort((a, b) =>
      `${a.size}-${a.color ?? ""}`.localeCompare(
        `${b.size}-${b.color ?? ""}`,
        "es",
        { numeric: true, sensitivity: "base" }
      )
    );
  }, [product.variants]);
  const availableVariants = variants.filter(
    (variant) => variant.active !== false && variant.available
  );
  const variantGroups = Array.from(
    new Set(availableVariants.map(getVariantGroup))
  ).sort((first, second) => {
    const order: VariantGroup[] = ["infant", "adult", "other"];
    return order.indexOf(first) - order.indexOf(second);
  });
  const [selectedGroup, setSelectedGroup] = useState<VariantGroup | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const activeGroup =
    selectedGroup ?? (variantGroups.length === 1 ? variantGroups[0] : null);
  const visibleVariants = activeGroup
    ? variants.filter((variant) => getVariantGroup(variant) === activeGroup)
    : [];
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((state) => state.addItem);
  const selectedLimit = selectedVariant?.maxQuantity ?? 10;
  const currentPrice = selectedVariant
    ? getVariantQuantityTotal(selectedVariant, quantity)
    : Number(product.basePrice) * quantity;
  const priceSegments = selectedVariant
    ? getVariantPricingSegments(selectedVariant, quantity).segments
    : [];
  const canAddToCart = !variants.length || Boolean(selectedVariant);
  const selectedLabel = selectedVariant
    ? [
        `talle ${formatStorefrontVariantSize(selectedVariant)}`,
        selectedVariant.color ? `color ${selectedVariant.color}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : variants.length
      ? "talle a confirmar"
      : "sin variante";
  const productUrl =
    providedProductUrl ||
    (typeof window === "undefined"
      ? ""
      : `${window.location.origin}/products/${product.slug}`);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hola, quiero consultar por ${product.name}, ${selectedLabel}. ${productUrl}`
      )}`
    : null;

  return (
    <div className="space-y-5">
      {variants.length ? (
        <div className="space-y-5">
          {variantGroups.length > 1 ? (
            <div>
              <Label className="mb-3 block text-base font-bold">
                1. Elegí el nivel
              </Label>
              <RadioGroup
                value={selectedGroup ?? ""}
                onValueChange={(value) => {
                  setSelectedGroup(value as VariantGroup);
                  setSelectedVariant(null);
                  setQuantity(1);
                }}
                className="grid grid-cols-2 gap-2"
              >
                {variantGroups.map((group) => (
                  <div key={group}>
                    <RadioGroupItem
                      value={group}
                      id={`group-${group}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`group-${group}`}
                      className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border bg-card px-3 py-3 text-center text-base font-bold peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary/20"
                    >
                      {getVariantGroupLabel(group)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          <div>
            <Label className="mb-3 block text-base font-bold">
              {variantGroups.length > 1 ? "2. Elegí el talle" : "Elegí el talle"}
            </Label>
            {!activeGroup ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Primero indicá si buscás para primaria o secundaria.
              </p>
            ) : null}
            <RadioGroup
              value={selectedVariant?.id ?? ""}
              onValueChange={(value) => {
                const variant =
                  visibleVariants.find((item) => item.id === value) || null;
                setSelectedVariant(variant);
                setQuantity((current) =>
                  variant
                    ? Math.max(1, Math.min(current, variant.maxQuantity ?? 10))
                    : 1
                );
              }}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {visibleVariants.map((variant) => {
                const stock = Number(variant.stock);
                const available = variant.active !== false && variant.available;
                const unitPrice = Number(
                  variant.priceOverride ?? product.basePrice
                );

                return (
                  <div key={variant.id}>
                    <RadioGroupItem
                      value={variant.id}
                      id={variant.id}
                      className="peer sr-only"
                      disabled={!available}
                    />
                    <Label
                      htmlFor={variant.id}
                      className="flex min-h-28 cursor-pointer flex-col justify-center rounded-xl border bg-card px-3 py-3 text-center text-base peer-disabled:cursor-not-allowed peer-disabled:opacity-45 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary/20"
                    >
                      <span className="font-bold">Talle {variant.size}</span>
                      {variant.color ? (
                        <span className="mt-1 text-xs text-muted-foreground">
                          {variant.color}
                        </span>
                      ) : null}
                      <span className="mt-2 font-bold text-foreground">
                        {available ? formatPrice(unitPrice) : "Sin disponibilidad"}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {available
                          ? stock > 0
                            ? "Entrega inmediata"
                            : "Preparación en 24–48 h"
                          : "Consultanos por este talle"}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          <div
            className={`rounded-xl border p-3 text-base leading-6 ${
              selectedVariant
                ? "border-primary/25 bg-primary/5 text-foreground"
                : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
            role="status"
            aria-live="polite"
          >
            {selectedVariant ? (
              <>
                <span className="font-bold">Talle elegido:</span>{" "}
                {formatStorefrontVariantSize(selectedVariant)}
                {selectedVariant.color ? `, ${selectedVariant.color}` : ""}
                <span className="mt-1 block text-base font-bold text-foreground">
                  {formatPrice(
                    Number(selectedVariant.priceOverride ?? product.basePrice)
                  )}
                </span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">
                  {selectedVariant.stock > 0
                    ? "Entrega inmediata para el stock disponible"
                    : "Preparación en 24–48 horas"}
                </span>
              </>
            ) : (
              <span className="font-bold">
                {activeGroup
                  ? "Tocá un talle para poder continuar."
                  : "Elegí el nivel y después el talle."}
              </span>
            )}
          </div>
          {!availableVariants.length ? (
            <p className="text-sm text-destructive">
              No hay variantes disponibles.
            </p>
          ) : null}
        </div>
      ) : null}

      {canAddToCart ? (
        <div className="flex items-center gap-4">
          <Label className="text-base font-semibold">Cantidad</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 text-lg"
              aria-label="Restar una unidad"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              disabled={quantity <= 1}
            >
              -
            </Button>
            <span className="w-10 text-center text-lg font-bold">{quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 text-lg"
              aria-label="Sumar una unidad"
              onClick={() =>
                setQuantity((current) =>
                  variants.length
                    ? Math.min(current + 1, selectedLimit)
                    : current + 1
                )
              }
              disabled={variants.length > 0 && quantity >= selectedLimit}
            >
              +
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        className="min-h-14 w-full text-base font-bold"
        size="lg"
        data-testid="add-to-cart-button"
        onClick={() =>
          canAddToCart &&
          addItem(product, selectedVariant?.id ?? null, quantity)
        }
        disabled={!canAddToCart}
      >
        {canAddToCart
          ? `Agregar al carrito - ${formatPrice(currentPrice)}`
          : "Primero elegí un talle"}
      </Button>

      {priceSegments.length > 1 ? (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">Esta cantidad combina dos precios:</p>
          {priceSegments.map((segment, index) => (
            <p
              key={`${segment.fulfillment}-${segment.unitPrice}-${index}`}
              className="mt-1 text-muted-foreground"
            >
              {segment.quantity} × {formatPrice(segment.unitPrice)} ·{" "}
              {segment.fulfillment === "immediate"
                ? "entrega inmediata"
                : "preparación en 24–48 h"}
            </p>
          ))}
        </div>
      ) : null}

      <PaymentConfidence amount={currentPrice} compact />

      {whatsappUrl ? (
        <Button variant="outline" className="min-h-12 w-full text-base" asChild>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            Consultar esta prenda por WhatsApp
          </a>
        </Button>
      ) : null}
    </div>
  );
}
