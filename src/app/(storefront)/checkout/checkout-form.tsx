"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Store,
  Truck,
  UserRoundCheck,
} from "lucide-react";
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
import {
  getAnalyticsSessionId,
  trackStorefrontEvent,
} from "@/lib/analytics/client";

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

type CheckoutFieldName =
  | "shippingMethod"
  | "fullName"
  | "email"
  | "phone"
  | "street"
  | "city"
  | "state"
  | "zip"
  | "references"
  | "couponCode";

type CheckoutFieldErrors = Partial<Record<CheckoutFieldName, string>>;

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
  const invalidFocusScheduled = useRef(false);
  const [isMounted, setIsMounted] = useState(false);
  const defaultAddress = getDefaultAddress(addresses);
  const defaultFullName = (defaultAddress?.name || profile?.full_name || "").trim();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [isCouponOpen, setIsCouponOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(Boolean(profile?.email));
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponFeedback, setCouponFeedback] =
    useState<CouponFeedback | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState(
    defaultAddress?.id || "manual"
  );
  const [saveAddress, setSaveAddress] = useState(addresses.length === 0);
  const [formData, setFormData] = useState({
    fullName: defaultFullName,
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
    if (!isMounted || !items.length) return;
    trackStorefrontEvent({
      event: "checkout_view",
      quantity: getCartItemCount(items),
      dedupe: true,
    });
  }, [cartSignature, isMounted, items]);
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

    setIsCouponOpen(true);
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
  const canChooseShipping = settings.pickup_enabled && localDeliveryAvailable;
  const hasAvailableShippingMethod =
    settings.pickup_enabled || localDeliveryAvailable;
  const subtotal = getTotal();
  const shippingCost = getShippingCost(formData.shippingMethod, {
    localDeliveryCost: settings.local_delivery_cost,
  });
  const localDeliveryCost = getShippingCost("local_delivery", {
    localDeliveryCost: settings.local_delivery_cost,
  });
  const freeLocalDelivery = localDeliveryCost === 0;
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
    const fieldName = event.target.name as CheckoutFieldName;
    setFieldErrors((current) => ({ ...current, [fieldName]: undefined }));
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
      setFieldErrors({ couponCode: "Ingresá un código de cupón." });
      document.getElementById("couponCode")?.focus();
      return;
    }

    setIsApplyingCoupon(true);
    setCouponFeedback(null);
    setFieldErrors((current) => ({ ...current, couponCode: undefined }));
    checkoutRequestId.current = null;

    try {
      const result = await validateCouponForCheckout({ code, subtotal });
      if (!result.valid) {
        setAppliedCoupon(null);
        setCouponFeedback({ type: "error", message: result.message });
        setFieldErrors({ couponCode: result.message });
        return;
      }

      setFormData((current) => ({ ...current, couponCode: result.code }));
      setAppliedCoupon({ code: result.code, discount: result.discount });
      setFieldErrors((current) => ({ ...current, couponCode: undefined }));
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
      setFieldErrors({
        couponCode: "No pudimos validar el cupón. Intentá nuevamente.",
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

    setFormData((current) => ({
      ...current,
      fullName: (address.name || profile?.full_name || "").trim(),
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip || "",
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const focusField = (field: string) => {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(field);
        element?.focus();
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };

    const showFieldError = (
      field: CheckoutFieldName,
      message: string,
      eventDetail:
        | "missing_name"
        | "invalid_phone"
        | "shipping_unavailable"
        | "missing_address"
        | "coupon_pending"
    ) => {
      setFieldErrors({ [field]: message });
      trackStorefrontEvent({
        event: "checkout_validation_error",
        eventDetail,
        quantity: getCartItemCount(items),
      });
      focusField(field);
    };

    const fullName = formData.fullName.trim();

    if (fullName.length < 2) {
      showFieldError(
        "fullName",
        "Escribí tu nombre y apellido para identificar el pedido.",
        "missing_name"
      );
      return;
    }

    if (!hasAvailableShippingMethod) {
      showFieldError(
        "shippingMethod",
        "No hay un método de entrega disponible. Sumá otra prenda o contactanos.",
        "shipping_unavailable"
      );
      return;
    }

    if (!isValidArgentinaContactPhone(formData.phone)) {
      showFieldError(
        "phone",
        "Ingresá un WhatsApp válido con código de área, sin 0 ni 15.",
        "invalid_phone"
      );
      return;
    }

    if (
      formData.shippingMethod === "local_delivery" &&
      !localDeliveryAvailable
    ) {
      showFieldError(
        "shippingMethod",
        `La entrega local está disponible desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas.`,
        "shipping_unavailable"
      );
      return;
    }

    if (formData.couponCode.trim() && !appliedCoupon) {
      setIsCouponOpen(true);
      showFieldError(
        "couponCode",
        "Aplicá el cupón antes de continuar o borrá el código ingresado.",
        "coupon_pending"
      );
      return;
    }

    setIsProcessing(true);

    try {
      checkoutRequestId.current ??= crypto.randomUUID();
      trackStorefrontEvent({
        event: "checkout_submit",
        quantity: getCartItemCount(items),
        value: total,
        contentIds: Array.from(new Set(items.map((item) => item.product_id))),
      });

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
          analyticsSessionId: getAnalyticsSessionId(),
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
        trackStorefrontEvent({
          event: "checkout_validation_error",
          eventDetail:
            response.status >= 500 ? "api_server_error" : "api_client_error",
          quantity: getCartItemCount(items),
        });
        if (response.status < 500 && response.status !== 409) {
          checkoutRequestId.current = null;
        }
        throw new Error(data.error || "No se pudo iniciar el checkout");
      }

      if (!data.preference?.init_point) {
        trackStorefrontEvent({
          event: "checkout_validation_error",
          eventDetail: "missing_payment_link",
          quantity: getCartItemCount(items),
        });
        throw new Error("Mercado Pago no devolvió un enlace de pago");
      }

      window.sessionStorage.removeItem(FACEBOOK_PROMOTION.storageKey);
      trackStorefrontEvent({
        event: "payment_redirect",
        quantity: getCartItemCount(items),
      });
      window.location.assign(data.preference.init_point);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo procesar el checkout"
      );
      setIsProcessing(false);
      focusField("checkout-error");
    }
  };

  const handleCheckoutCtaClick = () => {
    trackStorefrontEvent({
      event: "checkout_cta_click",
      quantity: getCartItemCount(items),
    });
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
        <Button className="mt-6" onClick={() => router.push("/uniformes")}>
          Ver uniformes
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <p className="text-sm font-semibold text-primary">Último paso en la tienda</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ya casi está
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Completá tu nombre y WhatsApp. Después pagás de forma segura en Mercado Pago.
        </p>
        <p className="mt-3 text-xs font-bold text-gloria-700 sm:text-sm">
          Tus datos → Mercado Pago → Confirmación
        </p>
      </div>

      <section className="mb-4 rounded-2xl border border-gloria-200 bg-gloria-50 p-4 lg:hidden" aria-label="Resumen de la compra">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold text-gloria-950">Tu compra</h2>
          <strong className="text-lg text-gloria-950">{formatPrice(total)}</strong>
        </div>
        <div className="mt-3 space-y-2 border-t border-dashed border-gloria-300 pt-3">
          {items.slice(0, 2).map((item) => {
            const variant = item.variant_id
              ? item.product?.variants?.find((current) => current.id === item.variant_id)
              : null;
            return (
              <p key={`${item.product_id}-${item.variant_id}`} className="flex justify-between gap-3 text-sm leading-5">
                <span className="min-w-0 truncate">
                  {item.product?.name}
                  {variant ? ` · ${formatStorefrontVariantSize(variant)}` : ""}
                </span>
                <span className="shrink-0 font-bold">× {item.quantity}</span>
              </p>
            );
          })}
          {items.length > 2 ? (
            <p className="text-xs font-semibold text-muted-foreground">
              Y {items.length - 2} prenda{items.length - 2 === 1 ? "" : "s"} más
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <form
          id={formId}
          data-testid="checkout-form"
          onSubmit={handleSubmit}
          onInvalid={(event) => {
            event.preventDefault();
            const field = event.target as HTMLInputElement;
            if (!field.name) return;
            const message = field.validity.valueMissing
              ? "Completá este dato para continuar."
              : field.validity.typeMismatch
                ? "Ingresá un dato válido."
                : field.validationMessage;
            setFieldErrors((current) => ({
              ...current,
              [field.name as CheckoutFieldName]: message,
            }));
            const eventDetail =
              field.name === "fullName"
                ? "missing_name"
                : field.name === "phone"
                  ? "invalid_phone"
                  : field.name === "email"
                    ? "invalid_email"
                    : "missing_address";
            trackStorefrontEvent({
              event: "checkout_validation_error",
              eventDetail,
              quantity: getCartItemCount(items),
            });
            if (!invalidFocusScheduled.current) {
              invalidFocusScheduled.current = true;
              window.requestAnimationFrame(() => {
                field.focus();
                field.scrollIntoView({ behavior: "smooth", block: "center" });
                window.setTimeout(() => {
                  invalidFocusScheduled.current = false;
                }, 300);
              });
            }
          }}
          className="space-y-6"
        >
          <div
            id="shippingMethod"
            tabIndex={-1}
            aria-invalid={Boolean(fieldErrors.shippingMethod)}
          >
            {canChooseShipping ? (
              <Card>
                <CardHeader>
                  <CardTitle>¿Cómo querés recibir tu compra?</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    aria-label="Método de entrega"
                    value={formData.shippingMethod}
                    onValueChange={(value) => {
                      checkoutRequestId.current = null;
                      setFieldErrors((current) => ({
                        ...current,
                        shippingMethod: undefined,
                      }));
                      setFormData((current) => ({
                        ...current,
                        shippingMethod: value as DeliveryMethod,
                      }));
                    }}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <DeliveryOption
                      id="pickup"
                      icon={Store}
                      title="Retiro coordinado"
                      description={pickupLocation}
                      price="Sin costo"
                    />
                    <DeliveryOption
                      id="local_delivery"
                      icon={Truck}
                      title={freeLocalDelivery ? "Envío local gratis" : "Entrega local"}
                      description="Ledesma y localidades cercanas, desde 2 prendas"
                      price={
                        localDeliveryCost > 0
                          ? formatPrice(localDeliveryCost)
                          : "Sin costo"
                      }
                    />
                  </RadioGroup>
                </CardContent>
              </Card>
            ) : hasAvailableShippingMethod ? (
              <section className="flex items-start gap-3 rounded-2xl border border-gloria-200 bg-gloria-50 p-4">
                {formData.shippingMethod === "pickup" ? (
                  <Store className="mt-0.5 size-5 shrink-0 text-gloria-700" />
                ) : (
                  <Truck className="mt-0.5 size-5 shrink-0 text-gloria-700" />
                )}
                <div>
                  <p className="font-extrabold text-gloria-950">
                    {formData.shippingMethod === "pickup"
                      ? "Retiro coordinado, sin costo"
                      : freeLocalDelivery
                        ? "Envío local gratis"
                        : `Entrega local · ${formatPrice(localDeliveryCost)}`}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {formData.shippingMethod === "pickup"
                      ? pickupLocation
                      : "Ledesma y localidades cercanas"}
                  </p>
                </div>
              </section>
            ) : null}
              {fieldErrors.shippingMethod ? (
                <p className="mt-3 text-sm font-semibold text-destructive" role="alert">
                  {fieldErrors.shippingMethod}
                </p>
              ) : null}
              {!hasAvailableShippingMethod ? (
                <div
                  className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
                  role="alert"
                >
                  No hay un método disponible para este carrito. Volvé al{" "}
                  <Link href="/cart" className="underline underline-offset-4">
                    carrito
                  </Link>{" "}
                  y sumá otra prenda para habilitar entrega local, o consultanos
                  antes de pagar.
                </div>
              ) : null}
              {settings.local_delivery_enabled && !canChooseShipping ? (
                <p
                  data-testid="local-delivery-condition"
                  className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold leading-6"
                >
                  {localDeliveryAvailable
                    ? freeLocalDelivery
                      ? `Tu compra de ${itemCount} prendas tiene envío local gratis en Ledesma. También podés retirar sin costo.`
                      : `Tu compra de ${itemCount} prendas habilita entrega local en Ledesma. También podés retirar sin costo.`
                    : freeLocalDelivery
                      ? `El envío local gratis en Ledesma se habilita desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas. Con una sola prenda, el pedido se retira de forma coordinada.`
                      : `La entrega local en Ledesma se habilita desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas. Con una sola prenda, el pedido se retira de forma coordinada.`}
                </p>
              ) : null}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>¿A nombre de quién queda el pedido?</CardTitle>
              <p className="text-sm leading-5 text-muted-foreground">
                Usamos tu WhatsApp para confirmar la compra y coordinar la entrega.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                label="Nombre y apellido"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                autoComplete="name"
                error={fieldErrors.fullName}
                placeholder="Ej. María López"
                required
              />
              <FormField
                label="WhatsApp"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
                autoComplete="tel"
                inputMode="tel"
                placeholder="Ej. 388 4123456"
                hint="Ingresá un número con código de área y WhatsApp, sin 0 ni 15."
                error={fieldErrors.phone}
                required
              />
              <button
                type="button"
                onClick={() => setIsEmailOpen((open) => !open)}
                aria-expanded={isEmailOpen}
                aria-controls="checkout-email-field"
                className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronDown className={`size-4 transition-transform ${isEmailOpen ? "rotate-180" : ""}`} />
                {isEmailOpen ? "Ocultar email" : "Agregar email (opcional)"}
              </button>
              {isEmailOpen ? (
                <div id="checkout-email-field">
                  <FormField
                    label="Email (opcional)"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    autoComplete="email"
                    error={fieldErrors.email}
                    hint="Si lo agregás, también recibirás las novedades por email."
                  />
                </div>
              ) : null}
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
                    <FormField label="Calle y número" name="street" value={formData.street} onChange={handleInputChange} error={fieldErrors.street} required />
                  </div>
                  <FormField label="Localidad" name="city" value={formData.city} onChange={handleInputChange} error={fieldErrors.city} required />
                  <FormField label="Provincia" name="state" value={formData.state} onChange={handleInputChange} error={fieldErrors.state} required />
                  <FormField label="Código postal" name="zip" value={formData.zip} onChange={handleInputChange} error={fieldErrors.zip} />
                  <FormField label="Referencias" name="references" value={formData.references} onChange={handleInputChange} error={fieldErrors.references} placeholder="Barrio, entre calles..." />
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
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-bold">Retiro de la compra online</p>
              <p className="mt-1 text-sm font-semibold">{pickupLocation}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {settings.pickup_instructions}
              </p>
              {pickupConfigured ? (
                <a
                  href={pickupMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/25 bg-background px-4 text-sm font-bold text-primary hover:bg-primary/5"
                >
                  <MapPin className="size-4" />
                  Cómo llegar con Google Maps
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          )}

          <ul className="space-y-2 rounded-2xl bg-gloria-50 p-4 text-sm font-semibold text-gloria-950 lg:hidden">
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-gloria-700" />
              Pago protegido por Mercado Pago
            </li>
            <li className="flex items-center gap-2">
              <UserRoundCheck className="size-4 shrink-0 text-gloria-700" />
              Podés pagar con tarjeta aunque no tengas cuenta
            </li>
            <li className="flex items-center gap-2">
              <MessageCircle className="size-4 shrink-0 text-gloria-700" />
              Te confirmamos el pedido por WhatsApp
            </li>
          </ul>

          <Card>
            <button
              type="button"
              onClick={() => setIsCouponOpen((open) => !open)}
              aria-expanded={isCouponOpen}
              aria-controls="checkout-coupon-content"
              className="flex min-h-14 w-full items-center justify-between gap-3 px-6 text-left font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span>
                ¿Tenés un cupón? <span className="font-medium text-muted-foreground">Es opcional</span>
              </span>
              <ChevronDown
                className={`size-5 transition-transform ${isCouponOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isCouponOpen ? (
            <CardContent id="checkout-coupon-content" className="space-y-4 border-t pt-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <FormField
                  label="Código (opcional)"
                  name="couponCode"
                  value={formData.couponCode}
                  onChange={handleInputChange}
                  placeholder="Ingresá tu código"
                  error={fieldErrors.couponCode}
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
              {couponFeedback?.type === "success" ? (
                <p
                  role="status"
                  className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold leading-6 text-primary"
                >
                  {couponFeedback.message}
                </p>
              ) : null}
            </CardContent>
            ) : null}
          </Card>

          {error ? (
            <p
              id="checkout-error"
              role="alert"
              tabIndex={-1}
              className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive"
            >
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
                        {item.product?.uniformPriceGroup
                          ? `${segment.quantity} prenda${segment.quantity === 1 ? "" : "s"} · `
                          : `${segment.quantity} × ${formatPrice(segment.unitPrice)} · `}
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
            <ul className="space-y-2 rounded-xl bg-gloria-50 p-3 text-sm font-semibold text-gloria-900">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-gloria-700" />
                Pago protegido por Mercado Pago
              </li>
              <li className="flex items-center gap-2">
                <UserRoundCheck className="size-4 text-gloria-700" />
                No necesitás crear una cuenta
              </li>
              <li className="flex items-center gap-2">
                <MessageCircle className="size-4 text-gloria-700" />
                Te confirmamos el pedido por WhatsApp
              </li>
            </ul>
            <Button className="hidden min-h-14 w-full text-base font-bold lg:flex" size="lg" type="submit" form={formId} data-testid="checkout-submit" onClick={handleCheckoutCtaClick} disabled={isProcessing || !hasAvailableShippingMethod}>
              {isProcessing ? "Abriendo Mercado Pago..." : "Ir a pagar con Mercado Pago"}
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gloria-200 bg-background/98 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_45px_-28px_oklch(0.2_0.045_136/0.55)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">Total</p>
            <p className="truncate text-lg font-black">{formatPrice(total)}</p>
          </div>
          <Button
            className="min-h-12 flex-1 px-3 text-sm font-extrabold"
            type="submit"
            form={formId}
            data-testid="checkout-submit-mobile"
            onClick={handleCheckoutCtaClick}
            disabled={isProcessing || !hasAvailableShippingMethod}
          >
            {isProcessing ? "Abriendo…" : "Ir a pagar con Mercado Pago"}
          </Button>
        </div>
        <p className="mx-auto mt-1 max-w-md text-center text-[0.68rem] font-semibold text-muted-foreground">
          Tarjeta o dinero disponible · sin registrarte
        </p>
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
      <Label htmlFor={id} className="flex min-h-32 cursor-pointer flex-col rounded-xl border p-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
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
  error,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-base font-semibold">{label}</Label>
      <Input
        id={name}
        name={name}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className="min-h-12 text-base"
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
