"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  RefreshCw,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  formatStorefrontVariantSize,
  getSchoolLevelLabel,
  getVariantPricingSegments,
  getVariantQuantityTotal,
} from "@/lib/inventory";
import { trackStorefrontEvent } from "@/lib/analytics/client";
import { getSchoolDisplayName } from "@/lib/school-uniforms";

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
  const router = useRouter();
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
  ).sort(
    (first, second) =>
      ["primary", "secondary"].indexOf(first) -
      ["primary", "secondary"].indexOf(second)
  );
  const [selectedSchoolLevel, setSelectedSchoolLevel] =
    useState<SchoolLevel | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
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
  const sizeGroups = Array.from(new Set(designVariants.map(getSizeGroup))).sort(
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
  const hasMultipleUnitPrices =
    new Set(priceSegments.map((segment) => segment.unitPrice)).size > 1;
  const hasPurchasableVariants = availableVariants.length > 0;
  const canPurchase = Boolean(selectedVariant);
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
      : `${window.location.origin}/uniformes/${product.slug}`);
  const schoolName = getSchoolDisplayName(product.brand || product.name);
  const whatsappUrl = whatsappPhone
    ? `https://wa.me/${whatsappPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hola, quiero consultar por ${product.name}, ${selectedLabel}. ${productUrl}`
      )}`
    : null;

  useEffect(() => {
    trackStorefrontEvent({
      event: "product_view",
      productId: product.id,
      value: Number(product.basePrice),
      contentName: product.name,
      dedupe: true,
    });
  }, [product.id]);

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addItem(product, selectedVariant.id, quantity);
    trackStorefrontEvent({
      event: "add_to_cart",
      productId: product.id,
      quantity,
      value: currentPrice,
      contentName: product.name,
    });
  };

  const handleBuyNow = () => {
    if (!selectedVariant || isBuyingNow) return;
    setIsBuyingNow(true);
    addItem(product, selectedVariant.id, quantity, { openCart: false });
    trackStorefrontEvent({
      event: "buy_now",
      productId: product.id,
      quantity,
      value: currentPrice,
      contentName: product.name,
    });
    router.push("/checkout");
  };

  const scrollToSelector = () => {
    document
      .getElementById("elegir-talle")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-5">
      {variants.length ? (
        <div className="space-y-5">
          {schoolLevels.length > 1 ? (
            <div>
              <Label
                id={designGroupLabelId}
                className="mb-3 block text-lg font-extrabold text-gloria-950"
              >
                ¿Es de Primaria o Secundaria?
              </Label>
              <RadioGroup
                aria-labelledby={designGroupLabelId}
                value={selectedSchoolLevel ?? ""}
                onValueChange={(value) => {
                  setSelectedSchoolLevel(value as SchoolLevel);
                  setSelectedVariant(null);
                  setQuantity(1);
                  trackStorefrontEvent({
                    event: "select_design",
                    productId: product.id,
                  });
                }}
                className="grid grid-cols-2 gap-2"
              >
                {schoolLevels.map((schoolLevel) => (
                  <div key={schoolLevel} className="relative min-h-14">
                    <RadioGroupItem
                      value={schoolLevel}
                      id={`${product.id}-school-level-${schoolLevel}`}
                      aria-label={getSchoolLevelLabel(schoolLevel) ?? schoolLevel}
                      className="absolute inset-0 size-full aspect-auto rounded-xl border border-gloria-200 bg-card text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 data-[state=checked]:ring-2 data-[state=checked]:ring-primary/20 [&>span]:hidden"
                    />
                    <span className="pointer-events-none relative flex min-h-14 items-center justify-center px-3 py-3 text-center text-base font-bold">
                      {getSchoolLevelLabel(schoolLevel) ?? schoolLevel}
                    </span>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          <div>
            <Label
              id={sizeGroupLabelId}
              className="block text-lg font-extrabold text-gloria-950"
            >
              Elegí el talle
            </Label>
            {product.uniformPriceGroup ? (
              <p className="mt-1 text-sm font-bold text-gloria-700">
                Mismo precio en todos los talles: {formatPrice(product.basePrice)}
              </p>
            ) : null}
            <details className="mb-3 mt-1 rounded-xl border border-gloria-200 bg-gloria-50 px-3 py-2">
              <summary className="flex min-h-9 cursor-pointer list-none items-center text-sm font-bold text-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                ¿No sabés qué talle elegir?
              </summary>
              <div className="pb-2 pt-1 text-sm leading-6 text-muted-foreground">
                <p>Juvenil: 8, 10, 12, 14 y 16.</p>
                <p>Adulto: 1, 2, 3, 4 y 5.</p>
                <p className="mt-2">
                  Primaria o Secundaria cambia el diseño, no define el talle. Si
                  dudás, medí una prenda que le quede bien y consultanos.
                </p>
              </div>
            </details>
            {!designSelected ? (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                Primero elegí Primaria o Secundaria.
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
                  if (variant) {
                    trackStorefrontEvent({
                      event: "select_size",
                      productId: product.id,
                    });
                  }
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
                            <div key={variant.id} className="relative min-h-20 sm:min-h-24">
                              <RadioGroupItem
                                value={variant.id}
                                id={`variant-${variant.id}`}
                                aria-label={`Talle ${variant.size}${
                                  variant.color ? `, ${variant.color}` : ""
                                }, ${formatPrice(unitPrice)}`}
                                className="absolute inset-0 size-full aspect-auto rounded-xl border border-gloria-200 bg-card text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary/10 data-[state=checked]:ring-2 data-[state=checked]:ring-primary/20 [&>span]:hidden"
                              />
                              <span className="pointer-events-none relative flex min-h-20 flex-col justify-center px-3 py-3 text-center text-base sm:min-h-24">
                                <span className="font-bold">Talle {variant.size}</span>
                                {variant.color ? (
                                  <span className="text-sm text-muted-foreground">
                                    {variant.color}
                                  </span>
                                ) : null}
                                {!product.uniformPriceGroup ? (
                                  <span className="mt-1 font-bold text-foreground">
                                    {formatPrice(unitPrice)}
                                  </span>
                                ) : null}
                              </span>
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
              <div className="space-y-1">
                <p className="text-sm font-semibold text-muted-foreground">
                  {schoolName}
                  {selectedVariant.schoolLevel
                    ? ` · ${getSchoolLevelLabel(selectedVariant.schoolLevel)}`
                    : ""}
                </p>
                <div className="flex items-baseline justify-between gap-3">
                  <strong>
                    Talle {formatStorefrontVariantSize(selectedVariant)}
                  </strong>
                  <strong className="text-lg">
                    {formatPrice(
                      Number(selectedVariant.priceOverride ?? product.basePrice)
                    )}
                  </strong>
                </div>
                <p className="text-sm font-semibold text-gloria-800">
                  {fulfillmentLabel}
                </p>
              </div>
            ) : (
              <span className="font-bold">
                {designSelected
                  ? "Tocá un talle para continuar."
                  : "Elegí el diseño y después el talle."}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {canPurchase ? (
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
                setQuantity((current) => Math.min(current + 1, selectedLimit))
              }
              disabled={quantity >= selectedLimit}
            >
              +
            </Button>
          </div>
        </div>
      ) : null}

      {hasPurchasableVariants ? (
        <div className="hidden gap-2 lg:grid">
          <Button
            className="min-h-14 text-base font-bold"
            size="lg"
            onClick={handleBuyNow}
            disabled={!canPurchase || isBuyingNow}
          >
            {isBuyingNow ? "Abriendo…" : "Comprar ahora"}
          </Button>
          <Button
            variant="outline"
            className="min-h-14 text-base font-bold"
            size="lg"
            data-testid="add-to-cart-button"
            onClick={handleAddToCart}
            disabled={!canPurchase}
          >
            Agregar al carrito para seguir eligiendo
          </Button>
        </div>
      ) : (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          No hay talles disponibles para comprar online. Consultanos y
          verificamos disponibilidad en el negocio.
        </div>
      )}

      {priceSegments.length > 1 && hasMultipleUnitPrices ? (
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
        <ul className="space-y-2 border-t border-dashed border-gloria-200 pt-4 text-sm font-semibold text-gloria-900">
          <li className="flex items-center gap-2">
            <RefreshCw className="size-4 shrink-0 text-gloria-700" />
            <Link href="/cambios-y-devoluciones" className="underline underline-offset-4">
              Cambio de talle dentro de 30 días
            </Link>
          </li>
          <li className="flex items-center gap-2">
            <CreditCard className="size-4 shrink-0 text-gloria-700" />
            Pago protegido por Mercado Pago
          </li>
          <li className="flex items-center gap-2">
            <Truck className="size-4 shrink-0 text-gloria-700" />
            Retiro coordinado o envío gratis desde 2 prendas
          </li>
        </ul>
      ) : null}

      {whatsappUrl ? (
        <Button
          variant={hasPurchasableVariants ? "outline" : "default"}
          className="min-h-12 w-full text-base"
          asChild
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackStorefrontEvent({
                event: "whatsapp_click",
                productId: product.id,
              })
            }
          >
            {hasPurchasableVariants
              ? "¿No encontrás tu talle? Consultanos"
              : "Consultar disponibilidad por WhatsApp"}
          </a>
        </Button>
      ) : null}

      {hasPurchasableVariants ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gloria-200 bg-background/98 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_45px_-28px_oklch(0.2_0.045_136/0.55)] backdrop-blur lg:hidden">
          <div className="mx-auto max-w-md">
            {selectedVariant ? (
              <>
                <div className="mb-2 flex items-center justify-between gap-3 px-1 text-sm">
                  <span className="truncate font-bold">
                    {formatStorefrontVariantSize(selectedVariant)} · {quantity} prenda{quantity === 1 ? "" : "s"}
                  </span>
                  <span className="shrink-0 font-black">{formatPrice(currentPrice)}</span>
                </div>
                 <div className="space-y-2">
                  <Button
                    className="min-h-12 w-full px-3 text-sm font-extrabold"
                    onClick={handleBuyNow}
                    disabled={isBuyingNow}
                  >
                    {isBuyingNow ? "Abriendo…" : "Comprar ahora"}
                    <ArrowRight className="ml-1 size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 w-full px-3 text-sm font-bold text-gloria-800"
                    data-testid="add-to-cart-button-mobile"
                    onClick={handleAddToCart}
                  >
                    <ShoppingBag className="mr-1 size-4" />
                    Agregar al carrito para seguir eligiendo
                  </Button>
                </div>
              </>
            ) : (
              <Button
                className="min-h-12 w-full justify-between px-5 text-base font-extrabold"
                onClick={scrollToSelector}
              >
                Elegir diseño y talle
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
