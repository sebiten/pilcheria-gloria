"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  ProductVariant,
  ProductWithDetails,
  SchoolLevel,
  SizeSystem,
} from "@/types";
import { formatPrice } from "@/lib/utils";
import { PaymentConfidence } from "@/components/storefront/payment-confidence";
import {
  formatStorefrontVariantSize,
  getSchoolLevelLabel,
  getVariantPricingSegments,
  getVariantQuantityTotal,
} from "@/lib/inventory";

interface AddToCartButtonProps {
  product: ProductWithDetails;
  whatsappPhone?: string | null;
  productUrl?: string;
}

type SizeGroup = SizeSystem | "other";

const SIZE_GROUP_ORDER: SizeGroup[] = ["infant", "adult", "other"];

function variantKey(variant: ProductVariant) {
  return `${variant.schoolLevel ?? "no-design"}:${variant.sizeSystem ?? "none"}:${variant.size.trim().toLocaleLowerCase("es-AR")}:${variant.color?.trim().toLocaleLowerCase("es-AR") ?? ""}`;
}

function getSizeGroup(variant: ProductVariant): SizeGroup {
  return variant.sizeSystem ?? "other";
}

function getSizeGroupLabel(group: SizeGroup) {
  if (group === "infant") return "Talles juveniles";
  if (group === "adult") return "Talles adultos";
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

    return Array.from(unique.values()).sort((first, second) =>
      `${first.size}-${first.color ?? ""}`.localeCompare(
        `${second.size}-${second.color ?? ""}`,
        "es",
        { numeric: true, sensitivity: "base" }
      )
    );
  }, [product.variants]);
  const availableVariants = variants.filter(
    (variant) => variant.active !== false && variant.available
  );
  const schoolLevels = Array.from(
    new Set(
      availableVariants.flatMap((variant) =>
        variant.schoolLevel ? [variant.schoolLevel] : []
      )
    )
  ).sort((first, second) =>
    ["primary", "secondary"].indexOf(first) -
    ["primary", "secondary"].indexOf(second)
  );
  const [selectedSchoolLevel, setSelectedSchoolLevel] =
    useState<SchoolLevel | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const activeSchoolLevel =
    selectedSchoolLevel ?? (schoolLevels.length === 1 ? schoolLevels[0] : null);
  const designSelected = schoolLevels.length === 0 || Boolean(activeSchoolLevel);
  const designVariants = designSelected
    ? availableVariants.filter(
        (variant) =>
          schoolLevels.length === 0 ||
          variant.schoolLevel === activeSchoolLevel
      )
    : [];
  const sizeGroups = Array.from(
    new Set(designVariants.map(getSizeGroup))
  ).sort(
    (first, second) =>
      SIZE_GROUP_ORDER.indexOf(first) - SIZE_GROUP_ORDER.indexOf(second)
  );
  const addItem = useCartStore((state) => state.addItem);
  const selectedLimit = selectedVariant?.maxQuantity ?? 10;
  const currentPrice = selectedVariant
    ? getVariantQuantityTotal(selectedVariant, quantity)
    : Number(product.basePrice) * quantity;
  const priceSegments = selectedVariant
    ? getVariantPricingSegments(selectedVariant, quantity).segments
    : [];
  const hasPurchasableVariants = availableVariants.length > 0;
  const canAddToCart = Boolean(selectedVariant);
  const hasImmediateFulfillment = priceSegments.some(
    (segment) => segment.fulfillment === "immediate"
  );
  const hasPreparedFulfillment = priceSegments.some(
    (segment) => segment.fulfillment === "24_48_hours"
  );
  const fulfillmentLabel = selectedVariant
    ? hasImmediateFulfillment && hasPreparedFulfillment
      ? "Combina entrega inmediata y preparación en 24–48 horas."
      : hasImmediateFulfillment ||
          (!priceSegments.length && selectedVariant.stock > 0)
        ? "Entrega inmediata."
        : "Preparación en 24–48 horas."
    : null;
  const designGroupLabelId = `product-${product.id}-design-label`;
  const sizeGroupLabelId = `product-${product.id}-size-label`;
  const selectedLabel = selectedVariant
    ? [
        getSchoolLevelLabel(selectedVariant.schoolLevel)
          ? `diseño ${getSchoolLevelLabel(selectedVariant.schoolLevel)}`
          : null,
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
          {schoolLevels.length > 1 ? (
            <div>
              <Label
                id={designGroupLabelId}
                className="mb-3 block text-base font-bold"
              >
                1. Elegí el diseño
              </Label>
              <RadioGroup
                aria-labelledby={designGroupLabelId}
                value={selectedSchoolLevel ?? ""}
                onValueChange={(value) => {
                  setSelectedSchoolLevel(value as SchoolLevel);
                  setSelectedVariant(null);
                  setQuantity(1);
                }}
                className="grid grid-cols-2 gap-2"
              >
                {schoolLevels.map((schoolLevel) => (
                  <div key={schoolLevel}>
                    <RadioGroupItem
                      value={schoolLevel}
                      id={`school-level-${schoolLevel}`}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={`school-level-${schoolLevel}`}
                      className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border bg-card px-3 py-3 text-center text-base font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary/20"
                    >
                      {getSchoolLevelLabel(schoolLevel)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          <div>
            <Label
              id={sizeGroupLabelId}
              className="mb-3 block text-base font-bold"
            >
              {schoolLevels.length > 1 ? "2. Elegí el talle" : "Elegí el talle"}
            </Label>
            {!designSelected ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Primero elegí si buscás el diseño de Primaria o Secundaria.
              </p>
            ) : (
              <RadioGroup
                aria-labelledby={sizeGroupLabelId}
                value={selectedVariant?.id ?? ""}
                onValueChange={(value) => {
                  const variant =
                    designVariants.find((item) => item.id === value) || null;
                  setSelectedVariant(variant);
                  setQuantity((current) =>
                    variant
                      ? Math.max(1, Math.min(current, variant.maxQuantity ?? 10))
                      : 1
                  );
                }}
                className="space-y-4"
              >
                {sizeGroups.map((group) => (
                  <div key={group}>
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">
                      {getSizeGroupLabel(group)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {designVariants
                        .filter((variant) => getSizeGroup(variant) === group)
                        .map((variant) => {
                          const unitPrice = Number(
                            variant.priceOverride ?? product.basePrice
                          );

                          return (
                            <div key={variant.id}>
                              <RadioGroupItem
                                value={variant.id}
                                id={`variant-${variant.id}`}
                                className="peer sr-only"
                              />
                              <Label
                                htmlFor={`variant-${variant.id}`}
                                className="flex min-h-24 cursor-pointer flex-col justify-center rounded-xl border bg-card px-3 py-3 text-center text-base peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary/20"
                              >
                                <span className="font-bold">Talle {variant.size}</span>
                                <span className="mt-2 font-bold text-foreground">
                                  {formatPrice(unitPrice)}
                                </span>
                              </Label>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </RadioGroup>
            )}
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
                {selectedVariant.schoolLevel ? (
                  <span className="block">
                    <span className="font-bold">Diseño:</span>{" "}
                    {getSchoolLevelLabel(selectedVariant.schoolLevel)}
                  </span>
                ) : null}
                <span className="block">
                  <span className="font-bold">Talle:</span>{" "}
                  {formatStorefrontVariantSize(selectedVariant)}
                </span>
                <span className="mt-1 block font-bold text-foreground">
                  {formatPrice(
                    Number(selectedVariant.priceOverride ?? product.basePrice)
                  )}
                </span>
                <span className="mt-1 block text-sm font-semibold text-muted-foreground">
                  {fulfillmentLabel}
                </span>
              </>
            ) : (
              <span className="font-bold">
                {designSelected
                  ? "Tocá un talle para poder continuar."
                  : "Elegí el diseño y después el talle."}
              </span>
            )}
          </div>
          {!availableVariants.length ? (
            <p className="text-sm text-destructive">
              No hay talles disponibles para comprar.
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
              aria-label="Restar una prenda"
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
              aria-label="Sumar una prenda"
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

      {hasPurchasableVariants ? (
        <Button
          className="min-h-14 w-full text-base font-bold"
          size="lg"
          data-testid="add-to-cart-button"
          onClick={() =>
            selectedVariant && addItem(product, selectedVariant.id, quantity)
          }
          disabled={!canAddToCart}
        >
          {canAddToCart
            ? `Agregar al carrito - ${formatPrice(currentPrice)}`
            : "Primero elegí un talle"}
        </Button>
      ) : (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          No hay talles disponibles para comprar online. Consultanos y
          verificamos disponibilidad en el negocio.
        </div>
      )}

      {priceSegments.length > 1 ? (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">El total combina estos precios:</p>
          {priceSegments.map((segment, index) => (
            <p
              key={`${segment.unitPrice}-${index}`}
              className="mt-1 text-muted-foreground"
            >
              {segment.quantity} × {formatPrice(segment.unitPrice)}
            </p>
          ))}
        </div>
      ) : null}

      {hasPurchasableVariants ? (
        <PaymentConfidence amount={currentPrice} compact />
      ) : null}

      {whatsappUrl ? (
        <Button
          variant={hasPurchasableVariants ? "outline" : "default"}
          className="min-h-12 w-full text-base"
          asChild
        >
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            {hasPurchasableVariants
              ? "¿No encontrás tu talle? Consultanos"
              : "Consultar disponibilidad por WhatsApp"}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
