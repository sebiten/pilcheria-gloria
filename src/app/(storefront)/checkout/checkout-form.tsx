"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Store, Truck } from "lucide-react";
import { addAddress, updateProfileContact } from "@/actions/auth";
import { useCartStore } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  canUseLocalDelivery,
  getCartItemCount,
  getCartItemLineTotal,
  getCartItemPricingSegments,
  getShippingCost,
  LOCAL_DELIVERY_MIN_ITEMS,
} from "@/lib/commerce";
import { formatStorefrontVariantSize } from "@/lib/inventory";
import { formatPrice } from "@/lib/utils";
import type { Address, Profile, StoreSettings } from "@/types";
import { PaymentConfidence } from "@/components/storefront/payment-confidence";
import {
  getGoogleMapsDirectionsUrl,
  getPickupAddress,
  hasPickupAddress,
} from "@/lib/maps";
import { isValidArgentinaContactPhone } from "@/lib/contact";
import { FACEBOOK_PROMOTION } from "@/lib/promotions";
import { validateCouponForCheckout } from "@/actions/coupons";
import { refreshCheckoutCart } from "@/actions/cart";

interface CheckoutFormProps {
  addresses: Address[];
  profile: Profile | null;
  settings: StoreSettings;
}

type DeliveryMethod = "pickup" | "local_delivery";

type AppliedCoupon = {
  code: string;
  discount: number;
};

type CouponFeedback = {
  type: "success" | "error";
  message: string;
};

function splitFullName(fullName: string | null | undefined) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function getDefaultAddress(addresses: Address[]) {
  return addresses.find((address) => address.is_default) || addresses[0] || null;
}

export function CheckoutForm({
  addresses,
  profile,
  settings,
}: CheckoutFormProps) {
  const formId = "checkout-form";
  const router = useRouter();
  const { items, getTotal, setItems } = useCartStore();
  const checkoutRequestId = useRef<string | null>(null);
  const cartRefreshStarted = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const defaultAddress = getDefaultAddress(addresses);
  const defaultName = splitFullName(defaultAddress?.name || profile?.full_name);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponFeedback, setCouponFeedback] =
    useState<CouponFeedback | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState(
    defaultAddress?.id || "manual"
  );
  const [saveAddress, setSaveAddress] = useState(addresses.length === 0);
  const [formData, setFormData] = useState({
    name: defaultName.name,
    lastName: defaultName.lastName,
    email: profile?.email || "",
    phone: profile?.phone || "",
    street: defaultAddress?.street || "",
    city: defaultAddress?.city || settings.city,
    state: defaultAddress?.state || settings.state,
    zip: defaultAddress?.zip || "",
    references: "",
    shippingMethod: (
      settings.pickup_enabled ? "pickup" : "local_delivery"
    ) as DeliveryMethod,
    couponCode: "",
  });
  const cartSignature = items
    .map(
      (item) =>
        `${item.product_id}:${item.variant_id ?? "default"}:${item.quantity}`
    )
    .sort()
    .join("|");

  useEffect(() => setIsMounted(true), []);
  useEffect(() => {
    if (!items.length || cartRefreshStarted.current) return;
    cartRefreshStarted.current = true;

    void refreshCheckoutCart(
      items.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
      }))
    )
      .then(setItems)
      .catch((refreshError) => {
        cartRefreshStarted.current = false;
        console.error("No se pudo actualizar el carrito:", refreshError);
      });
  }, [items, setItems]);
  useEffect(() => {
    const promotionCode = window.sessionStorage.getItem(
      FACEBOOK_PROMOTION.storageKey
    );

    if (!promotionCode) return;

    setFormData((current) =>
      current.couponCode
        ? current
        : { ...current, couponCode: promotionCode }
    );
  }, []);
  useEffect(() => {
    checkoutRequestId.current = null;
    setAppliedCoupon(null);
    setCouponFeedback(null);
  }, [cartSignature]);

  const itemCount = getCartItemCount(items);
  const localDeliveryAvailable =
    settings.local_delivery_enabled && canUseLocalDelivery(items);
  const subtotal = getTotal();
  const shippingCost = getShippingCost(formData.shippingMethod, {
    localDeliveryCost: settings.local_delivery_cost,
  });
  const localDeliveryCost = getShippingCost("local_delivery", {
    localDeliveryCost: settings.local_delivery_cost,
  });
  const discount = appliedCoupon?.discount ?? 0;
  const total = Math.max(0, subtotal - discount + shippingCost);
  const needsAddress = formData.shippingMethod === "local_delivery";
  const shouldOfferSaveAddress =
    Boolean(profile) && needsAddress && selectedAddressId === "manual";
  const pickupConfigured = hasPickupAddress(settings);
  const pickupAddress = getPickupAddress(settings);
  const pickupMapsUrl = getGoogleMapsDirectionsUrl(pickupAddress);
  const pickupLocation = pickupConfigured
    ? settings.address_line
    : "Ubicación a confirmar por WhatsApp";

  useEffect(() => {
    if (
      formData.shippingMethod !== "local_delivery" ||
      localDeliveryAvailable ||
      !settings.pickup_enabled
    ) {
      return;
    }

    checkoutRequestId.current = null;
    setFormData((current) => ({ ...current, shippingMethod: "pickup" }));
  }, [
    formData.shippingMethod,
    localDeliveryAvailable,
    settings.pickup_enabled,
  ]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    checkoutRequestId.current = null;
    if (event.target.name === "couponCode") {
      setAppliedCoupon(null);
      setCouponFeedback(null);
    }
    setFormData((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleApplyCoupon = async () => {
    const code = formData.couponCode.trim();
    if (!code) {
      setCouponFeedback({
        type: "error",
        message: "Ingresá un código de cupón.",
      });
      return;
    }

    setIsApplyingCoupon(true);
    setCouponFeedback(null);
    checkoutRequestId.current = null;

    try {
      const result = await validateCouponForCheckout({ code, subtotal });
      if (!result.valid) {
        setAppliedCoupon(null);
        setCouponFeedback({ type: "error", message: result.message });
        return;
      }

      setFormData((current) => ({ ...current, couponCode: result.code }));
      setAppliedCoupon({ code: result.code, discount: result.discount });
      setCouponFeedback({
        type: "success",
        message: `Cupón ${result.code} aplicado. Ahorrás ${formatPrice(result.discount)}.`,
      });
    } catch {
      setAppliedCoupon(null);
      setCouponFeedback({
        type: "error",
        message: "No pudimos validar el cupón. Intentá nuevamente.",
      });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleAddressSelect = (value: string) => {
    checkoutRequestId.current = null;
    setSelectedAddressId(value);
    setError(null);

    const address = addresses.find((item) => item.id === value);
    if (!address) return;

    const recipient = splitFullName(address.name || profile?.full_name);
    setFormData((current) => ({
      ...current,
      name: recipient.name,
      lastName: recipient.lastName,
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip || "",
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      const fullName = `${formData.name} ${formData.lastName}`.trim();

      if (!isValidArgentinaContactPhone(formData.phone)) {
        throw new Error(
          "Ingresá un teléfono válido con código de área para poder contactarte."
        );
      }

      if (
        formData.shippingMethod === "local_delivery" &&
        !localDeliveryAvailable
      ) {
        throw new Error(
          `La entrega local está disponible desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas.`
        );
      }

      if (formData.couponCode.trim() && !appliedCoupon) {
        throw new Error(
          "Aplicá el cupón antes de continuar o borrá el código ingresado."
        );
      }

      checkoutRequestId.current ??= crypto.randomUUID();

      if (
        profile &&
        (formData.phone.trim() !== (profile.phone || "") ||
          fullName !== (profile.full_name || "").trim())
      ) {
        await updateProfileContact({
          fullName,
          phone: formData.phone,
        });
      }

      if (shouldOfferSaveAddress && saveAddress) {
        await addAddress({
          name: fullName,
          street: formData.street.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          zip: formData.zip.trim() || undefined,
          isDefault: addresses.length === 0,
        });
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutRequestId.current,
        },
        body: JSON.stringify({
          items,
          expectedSubtotal: subtotal,
          shippingMethod: formData.shippingMethod,
          couponCode: appliedCoupon?.code,
          shippingAddress: {
            name: fullName,
            email: formData.email.trim() || null,
            phone: formData.phone.trim(),
            street: needsAddress ? formData.street.trim() : null,
            city: needsAddress ? formData.city.trim() : null,
            state: needsAddress ? formData.state.trim() : null,
            zip: needsAddress ? formData.zip.trim() || null : null,
            references: needsAddress
              ? formData.references.trim() || null
              : settings.pickup_instructions,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500 && response.status !== 409) {
          checkoutRequestId.current = null;
        }
        throw new Error(data.error || "No se pudo iniciar el checkout");
      }

      if (!data.preference?.init_point) {
        throw new Error("Mercado Pago no devolvió un enlace de pago");
      }

      window.sessionStorage.removeItem(FACEBOOK_PROMOTION.storageKey);
      window.location.assign(data.preference.init_point);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo procesar el checkout"
      );
      setIsProcessing(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="h-[32rem] animate-pulse rounded-2xl bg-muted" />
          <div className="h-80 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-3xl font-extrabold">Tu carrito está vacío</h1>
        <p className="mt-3 text-muted-foreground">
          Elegí una prenda para continuar con la compra.
        </p>
        <Button className="mt-6" onClick={() => router.push("/products")}>
          Ver productos
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">Compra segura</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Finalizar compra
        </h1>
        <ol
          className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-bold sm:text-sm"
          aria-label="Pasos de la compra"
        >
          <li className="rounded-full bg-primary px-2 py-2 text-primary-foreground">
            1. Tus datos
          </li>
          <li className="rounded-full bg-muted px-2 py-2 text-muted-foreground">
            2. Mercado Pago
          </li>
          <li className="rounded-full bg-muted px-2 py-2 text-muted-foreground">
            3. Confirmación
          </li>
        </ol>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <form
          id={formId}
          data-testid="checkout-form"
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>¿Cómo querés recibir tu compra?</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={formData.shippingMethod}
                onValueChange={(value) => {
                  checkoutRequestId.current = null;
                  setFormData((current) => ({
                    ...current,
                    shippingMethod: value as DeliveryMethod,
                  }));
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                {settings.pickup_enabled ? (
                  <DeliveryOption
                    id="pickup"
                    icon={Store}
                    title="Retiro coordinado"
                    description={pickupLocation}
                    price="Sin costo"
                  />
                ) : null}
                {localDeliveryAvailable ? (
                  <DeliveryOption
                    id="local_delivery"
                    icon={Truck}
                    title="Entrega local"
                    description="Ledesma y localidades cercanas"
                    price={
                      localDeliveryCost > 0
                        ? formatPrice(localDeliveryCost)
                        : "Sin costo"
                    }
                  />
                ) : null}
              </RadioGroup>
              {settings.local_delivery_enabled ? (
                <p
                  data-testid="local-delivery-condition"
                  className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold leading-6"
                >
                  {localDeliveryAvailable
                    ? `Tu compra de ${itemCount} prendas habilita entrega local en Ledesma. También podés retirar sin costo.`
                    : `La entrega local en Ledesma se habilita desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas. Con una sola prenda, el pedido se retira de forma coordinada.`}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos de contacto</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {!profile ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-base leading-6 sm:col-span-2">
                  <p className="font-bold">Podés comprar sin registrarte.</p>
                  <p className="mt-2 text-muted-foreground">
                    Tu pedido queda protegido con un código único y el pago se
                    hace de forma segura en Mercado Pago.
                  </p>
                  <p className="mt-2 font-semibold text-foreground">
                    Escribí un WhatsApp real para confirmar el pedido y
                    coordinar el retiro. El email es opcional.
                  </p>
                </div>
              ) : null}
              <FormField label="Nombre" name="name" value={formData.name} onChange={handleInputChange} required />
              <FormField label="Apellido" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
              <FormField
                label="Email (opcional)"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                autoComplete="email"
                hint="Si lo ingresás, también recibirás por email las novedades del pedido."
              />
              <FormField
                label="Teléfono"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
                autoComplete="tel"
                inputMode="tel"
                placeholder="Ej. 388 4123456"
                hint="Ingresá un número con código de área y WhatsApp, sin 0 ni 15."
                required
              />
            </CardContent>
          </Card>

          {needsAddress ? (
            <>
              {addresses.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Dirección guardada</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={selectedAddressId}
                      onValueChange={handleAddressSelect}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      {addresses.map((address) => (
                        <div key={address.id}>
                          <RadioGroupItem value={address.id} id={`address-${address.id}`} className="peer sr-only" />
                          <Label htmlFor={`address-${address.id}`} className="flex min-h-24 cursor-pointer flex-col rounded-xl border p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                            <span className="font-semibold">{address.name}</span>
                            <span className="mt-1 text-sm text-muted-foreground">{address.street}</span>
                            <span className="text-sm text-muted-foreground">{address.city}</span>
                          </Label>
                        </div>
                      ))}
                      <div>
                        <RadioGroupItem value="manual" id="address-manual" className="peer sr-only" />
                        <Label htmlFor="address-manual" className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                          <MapPin className="h-5 w-5" />
                          Cargar otra dirección
                        </Label>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Dirección de entrega</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FormField label="Calle y número" name="street" value={formData.street} onChange={handleInputChange} required />
                  </div>
                  <FormField label="Localidad" name="city" value={formData.city} onChange={handleInputChange} required />
                  <FormField label="Provincia" name="state" value={formData.state} onChange={handleInputChange} required />
                  <FormField label="Código postal" name="zip" value={formData.zip} onChange={handleInputChange} />
                  <FormField label="Referencias" name="references" value={formData.references} onChange={handleInputChange} placeholder="Barrio, entre calles..." />
                  {shouldOfferSaveAddress ? (
                    <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
                      <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} />
                      Guardar esta dirección para futuras compras
                    </label>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <p className="font-semibold">{pickupLocation}</p>
              <p className="mt-2 text-base leading-7 text-muted-foreground">
                {settings.pickup_instructions}
              </p>
              {pickupConfigured ? (
                <a
                  href={pickupMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full border border-primary/25 bg-background px-4 text-base font-bold text-primary hover:bg-primary/5"
                >
                  <MapPin className="size-4" />
                  Cómo llegar con Google Maps
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cupón de descuento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <FormField
                  label="Código (opcional)"
                  name="couponCode"
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  placeholder="Ingresá tu código"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 px-6 text-base font-bold"
                  onClick={handleApplyCoupon}
                  disabled={isApplyingCoupon || !formData.couponCode.trim()}
                >
                  {isApplyingCoupon ? "Validando..." : "Aplicar"}
                </Button>
              </div>
              {couponFeedback ? (
                <p
                  role={couponFeedback.type === "error" ? "alert" : "status"}
                  className={
                    couponFeedback.type === "error"
                      ? "rounded-xl bg-destructive/10 p-3 text-sm font-semibold leading-6 text-destructive"
                      : "rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold leading-6 text-primary"
                  }
                >
                  {couponFeedback.message}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {items.map((item) => {
                const variant = item.variant_id
                  ? item.product?.variants?.find(
                      (current) => current.id === item.variant_id
                    )
                  : null;
                const pricing = getCartItemPricingSegments(item);

                return (
                  <div
                    key={`${item.product_id}-${item.variant_id}`}
                    className="text-sm"
                  >
                    <div className="flex justify-between gap-4">
                      <span>
                        {item.product?.name}
                        {variant
                          ? ` · ${formatStorefrontVariantSize(variant)}`
                          : ""}{" "}
                        × {item.quantity}
                      </span>
                      <span className="font-semibold">
                        {formatPrice(getCartItemLineTotal(item))}
                      </span>
                    </div>
                    {pricing.segments.map((segment, index) => (
                      <p
                        key={`${segment.fulfillment}-${segment.unitPrice}-${index}`}
                        className="mt-1 text-xs text-muted-foreground"
                      >
                        {segment.quantity} × {formatPrice(segment.unitPrice)} ·{" "}
                        {segment.fulfillment === "immediate"
                          ? "entrega inmediata"
                          : "preparación en 24–48 h"}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {appliedCoupon ? (
                <div className="flex justify-between font-semibold text-primary">
                  <span>Descuento ({appliedCoupon.code})</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>{needsAddress ? "Entrega local" : "Retiro"}</span>
                <span>{shippingCost === 0 ? "Sin costo" : formatPrice(shippingCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-lg font-extrabold">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Button className="min-h-14 w-full text-base font-bold" size="lg" type="submit" form={formId} data-testid="checkout-submit" disabled={isProcessing}>
              {isProcessing ? "Abriendo Mercado Pago..." : "Continuar a Mercado Pago"}
            </Button>
            <PaymentConfidence amount={total} compact />
            <p className="text-xs leading-5 text-muted-foreground">
              El stock se reserva durante 30 minutos. Al continuar aceptás los{" "}
              <Link href="/terminos" className="font-semibold underline">
                términos de compra
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" className="font-semibold underline">
                política de privacidad
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function DeliveryOption({
  id,
  icon: Icon,
  title,
  description,
  price,
}: {
  id: DeliveryMethod;
  icon: typeof Store;
  title: string;
  description: string;
  price: string;
}) {
  return (
    <div>
      <RadioGroupItem value={id} id={id} className="peer sr-only" />
      <Label htmlFor={id} className="flex min-h-32 cursor-pointer flex-col rounded-xl border p-4 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
        <Icon className="h-5 w-5 text-primary" />
        <span className="mt-4 text-base font-bold">{title}</span>
        <span className="mt-1 text-sm text-muted-foreground">{description}</span>
        <span className="mt-auto pt-3 text-sm font-bold">{price}</span>
      </Label>
    </div>
  );
}

function FormField({
  label,
  name,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  hint?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-base font-semibold">{label}</Label>
      <Input
        id={name}
        name={name}
        aria-describedby={hintId}
        className="min-h-12 text-base"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
