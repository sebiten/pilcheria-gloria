"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Landmark,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import { addAddress, updateProfileContact } from "@/actions/auth";
import { useCartStore } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import type {
  Address,
  PaymentProvider,
  Profile,
  StoreSettings,
} from "@/types";
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
import {
  getMercadoPagoDeviceId,
  MercadoPagoDeviceIdScript,
} from "@/components/storefront/mercadopago-device-id";

interface CheckoutFormProps {
  addresses: Address[];
  profile: Profile | null;
  settings: StoreSettings;
  enabledPaymentProviders: PaymentProvider[];
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
type CartRefreshStatus = "updating" | "ready" | "error";

function PaymentButtonContent({
  isProcessing,
  provider,
}: {
  isProcessing: boolean;
  provider: PaymentProvider;
}) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
        {provider === "mercadopago" ? (
          <Image
            src="/payment-methods/mercadopago.svg"
            alt=""
            width={24}
            height={17}
            className="h-auto w-6"
            aria-hidden="true"
          />
        ) : provider === "bank_transfer" ? (
          <Landmark className="size-5 text-gloria-800" aria-hidden="true" />
        ) : (
          <span className="text-xs font-black text-violet-700">viüMi</span>
        )}
      </span>
      <span>
        {isProcessing
          ? provider === "bank_transfer" ? "Reservando…" : "Preparando el pago…"
          : provider === "bank_transfer"
            ? "Reservar y ver datos de transferencia"
            : `Continuar a ${provider === "mercadopago" ? "Mercado Pago" : "viüMi"}`}
      </span>
    </>
  );
}

function getDefaultAddress(addresses: Address[]) {
  return addresses.find((address) => address.is_default) || addresses[0] || null;
}

export function CheckoutForm({
  addresses,
  profile,
  settings,
  enabledPaymentProviders,
}: CheckoutFormProps) {
  const formId = "checkout-form";
  const router = useRouter();
  const { items, getTotal, setItems } = useCartStore();
  const checkoutRequestId = useRef<string | null>(null);
  const submitLock = useRef(false);
  const lastRefreshedCartSignature = useRef("");
  const [isMounted, setIsMounted] = useState(false);
  const defaultAddress = getDefaultAddress(addresses);
  const defaultFullName = (defaultAddress?.name || profile?.full_name || "").trim();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cartRefreshStatus, setCartRefreshStatus] =
    useState<CartRefreshStatus>("updating");
  const [cartRefreshError, setCartRefreshError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [isCouponOpen, setIsCouponOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(Boolean(profile?.email));
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [paymentProvider, setPaymentProvider] =
    useState<PaymentProvider>(enabledPaymentProviders[0] ?? "mercadopago");
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
  const refreshCart = useCallback(async () => {
    const currentItems = useCartStore.getState().items;
    if (!currentItems.length) return;

    setCartRefreshStatus("updating");
    setCartRefreshError(null);
    setError(null);

    try {
      const refreshedItems = await refreshCheckoutCart(
        currentItems.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
        }))
      );
      setItems(refreshedItems);
      const hasUnavailableItem = refreshedItems.some((item) => {
        const variant = item.variant_id
          ? item.product?.variants?.find(
              (current) => current.id === item.variant_id
            )
          : null;

        return !item.product || !variant || !variant.active || !variant.available;
      });
      if (hasUnavailableItem) {
        setCartRefreshError(
          "Hay una prenda o un talle que ya no está disponible. Editá el carrito para continuar."
        );
        setCartRefreshStatus("error");
        return;
      }
      setCartRefreshStatus("ready");
    } catch (refreshError) {
      console.error("No se pudo actualizar el carrito:", refreshError);
      setCartRefreshError(
        "Revisá tu conexión y reintentá. No podés continuar con precios desactualizados."
      );
      setCartRefreshStatus("error");
    }
  }, [setItems]);

  useEffect(() => {
    if (!items.length || lastRefreshedCartSignature.current === cartSignature) {
      return;
    }
    lastRefreshedCartSignature.current = cartSignature;
    void refreshCart();
  }, [cartSignature, items.length, refreshCart]);
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
    if (!address) {
      setFormData((current) => ({
        ...current,
        street: "",
        city: settings.city,
        state: settings.state,
        zip: "",
      }));
      return;
    }

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
    if (submitLock.current) return;
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
        | "invalid_email"
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

    if (cartRefreshStatus !== "ready") {
      setError(
        cartRefreshStatus === "error"
          ? "No pudimos actualizar precios y disponibilidad. Reintentá antes de continuar."
          : "Estamos actualizando precios y disponibilidad. Esperá un momento."
      );
      focusField("cart-refresh-status");
      return;
    }

    if (!enabledPaymentProviders.includes(paymentProvider)) {
      setError("No hay un procesador de pago disponible en este momento.");
      focusField("checkout-error");
      return;
    }

    if (!isValidArgentinaContactPhone(formData.phone)) {
      showFieldError(
        "phone",
        "Ingresá un WhatsApp válido con código de área.",
        "invalid_phone"
      );
      return;
    }

    const email = formData.email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setIsEmailOpen(true);
      showFieldError(
        "email",
        "Ingresá un email válido, por ejemplo nombre@correo.com.",
        "invalid_email"
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

    if (needsAddress && formData.street.trim().length < 3) {
      showFieldError(
        "street",
        "Ingresá la calle y el número para coordinar la entrega.",
        "missing_address"
      );
      return;
    }

    if (needsAddress && formData.city.trim().length < 2) {
      showFieldError(
        "city",
        "Ingresá la localidad donde entregaremos el pedido.",
        "missing_address"
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

    submitLock.current = true;
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
          paymentProvider,
          deviceId:
            paymentProvider === "mercadopago"
              ? getMercadoPagoDeviceId()
              : null,
          items,
          expectedSubtotal: subtotal,
          analyticsSessionId: getAnalyticsSessionId(),
          shippingMethod: formData.shippingMethod,
          couponCode: appliedCoupon?.code,
          shippingAddress: {
            name: fullName,
            email: email || null,
            phone: formData.phone.trim(),
            street: needsAddress ? formData.street.trim() : null,
            city: needsAddress ? formData.city.trim() : null,
            state: needsAddress ? formData.state.trim() || settings.state : null,
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
        throw new Error(data.error || "No se pudo iniciar el checkout");
      }

      const checkoutUrl = data.payment?.checkoutUrl || data.preference?.init_point;
      if (!checkoutUrl) {
        trackStorefrontEvent({
          event: "checkout_validation_error",
          eventDetail: "missing_payment_link",
          quantity: getCartItemCount(items),
        });
        throw new Error("El procesador no devolvió un enlace de pago");
      }

      window.sessionStorage.removeItem(FACEBOOK_PROMOTION.storageKey);
      trackStorefrontEvent({
        event: "payment_redirect",
        quantity: getCartItemCount(items),
      });
      window.location.assign(checkoutUrl);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo procesar el checkout"
      );
      setIsProcessing(false);
      submitLock.current = false;
      focusField("checkout-error");
    }
  };

  const validateContactField = (field: "phone" | "email") => {
    if (field === "phone") {
      const message = isValidArgentinaContactPhone(formData.phone)
        ? undefined
        : "Usá 10 dígitos con código de área. Aceptamos +54 9 y formatos antiguos con 0 y 15.";
      setFieldErrors((current) => ({ ...current, phone: message }));
      return;
    }

    const email = formData.email.trim();
    const message =
      email && !/^\S+@\S+\.\S+$/.test(email)
        ? "Ingresá un email válido, por ejemplo nombre@correo.com."
        : undefined;
    setFieldErrors((current) => ({ ...current, email: message }));
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

  const summaryContent = (
    <>
      <div className="space-y-4">
        {items.map((item) => {
          const variant = item.variant_id
            ? item.product?.variants?.find(
                (current) => current.id === item.variant_id
              )
            : null;
          const pricing = getCartItemPricingSegments(item);

          return (
            <div key={`${item.product_id}-${item.variant_id}`} className="text-sm">
              <div className="flex justify-between gap-4">
                <span className="min-w-0 font-semibold">
                  {item.product?.name}
                  {variant ? ` · Talle ${formatStorefrontVariantSize(variant)}` : ""}
                  <span className="block font-normal text-muted-foreground">
                    Cantidad: {item.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-bold">
                  {formatPrice(getCartItemLineTotal(item))}
                </span>
              </div>
              {pricing.segments.map((segment, index) => (
                <p
                  key={`${segment.fulfillment}-${segment.unitPrice}-${index}`}
                  className="mt-1 text-xs leading-5 text-muted-foreground"
                >
                  {item.product?.uniformPriceGroup
                    ? `${segment.quantity} prenda${segment.quantity === 1 ? "" : "s"}`
                    : `${segment.quantity} × ${formatPrice(segment.unitPrice)}`}
                  {segment.fulfillment === "immediate"
                    ? ", entrega inmediata"
                    : ", preparación en 24-48 h"}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      <div className="space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        {appliedCoupon ? (
          <div className="flex justify-between gap-4 font-semibold text-primary">
            <span>Descuento ({appliedCoupon.code})</span>
            <span>-{formatPrice(discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <span>{needsAddress ? "Entrega local" : "Retiro"}</span>
          <span>{shippingCost === 0 ? "Sin costo" : formatPrice(shippingCost)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t pt-3 text-lg font-black">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>
      <Link
        href="/cart"
        className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline underline-offset-4"
      >
        Editar carrito
      </Link>
    </>
  );

  const trustContent = (
    <div className="space-y-3">
      <PaymentConfidence amount={total} compact />
      <ul className="space-y-2 text-sm font-semibold text-gloria-950">
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-gloria-700" aria-hidden="true" />
          {paymentProvider === "bank_transfer"
            ? "Transferencia vinculada a este pedido"
            : `Pago protegido por ${paymentProvider === "mercadopago" ? "Mercado Pago" : "viüMi"}`}
        </li>
        <li className="flex items-center gap-2">
          <UserRoundCheck className="size-4 shrink-0 text-gloria-700" aria-hidden="true" />
          {paymentProvider === "bank_transfer"
            ? "Confirmamos manualmente al verificar la acreditación"
            : "Tus datos de pago se ingresan en el procesador elegido"}
        </li>
        <li className="flex items-center gap-2">
          <MessageCircle className="size-4 shrink-0 text-gloria-700" aria-hidden="true" />
          Confirmamos tu pedido por WhatsApp
        </li>
      </ul>
    </div>
  );

  const checkoutDisabled =
    isProcessing ||
    cartRefreshStatus !== "ready" ||
    enabledPaymentProviders.length === 0 ||
    !hasAvailableShippingMethod;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-44 pt-7 sm:px-6 sm:pt-10 lg:pb-16">
      {enabledPaymentProviders.includes("mercadopago") ? (
        <MercadoPagoDeviceIdScript />
      ) : null}
      <div className="mb-7">
        <h1 className="text-3xl font-black tracking-tight text-gloria-950 sm:text-4xl">
          Finalizar compra
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Completá la entrega, tus datos y elegí cómo pagar.
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-gloria-800" aria-label="Pasos para finalizar la compra">
          <li>Datos y entrega</li>
          <li aria-hidden="true">→</li>
          <li>Pago seguro</li>
          <li aria-hidden="true">→</li>
          <li>Confirmación</li>
        </ol>
      </div>

      <div
        id="cart-refresh-status"
        tabIndex={-1}
        data-testid="cart-refresh-status"
        className={`mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${
          cartRefreshStatus === "error"
            ? "border-amber-300 bg-amber-50 text-amber-950"
            : "border-gloria-200 bg-gloria-50 text-gloria-950"
        }`}
        role={cartRefreshStatus === "error" ? "alert" : "status"}
      >
        {cartRefreshStatus === "updating" ? (
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : cartRefreshStatus === "error" ? (
          <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gloria-700" aria-hidden="true" />
        )}
        <div className="flex-1">
          <p className="font-bold">
            {cartRefreshStatus === "updating"
              ? "Actualizando precios y disponibilidad..."
              : cartRefreshStatus === "error"
                ? "No pudimos actualizar el carrito"
                : "Precios y disponibilidad actualizados"}
          </p>
          {cartRefreshStatus === "error" ? (
            <>
              <p>{cartRefreshError}</p>
              <div className="mt-1 flex flex-wrap gap-x-4">
                <button
                  type="button"
                  onClick={() => void refreshCart()}
                  className="min-h-11 font-black underline underline-offset-4"
                >
                  Reintentar actualización
                </button>
                <Link href="/cart" className="inline-flex min-h-11 items-center font-black underline underline-offset-4">
                  Editar carrito
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <details className="group mb-5 rounded-xl border border-gloria-200 bg-background lg:hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 marker:hidden">
          <span className="font-black text-gloria-950">Resumen de tu compra</span>
          <span className="flex items-center gap-2">
            <strong className="text-lg text-gloria-950">{formatPrice(total)}</strong>
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="space-y-4 border-t px-4 py-5">{summaryContent}</div>
      </details>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <form
          id={formId}
          data-testid="checkout-form"
          noValidate
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          <section
            aria-labelledby="checkout-delivery-title"
            className="rounded-xl border bg-card text-card-foreground shadow"
          >
              <CardHeader>
                <h2 id="checkout-delivery-title" className="font-semibold leading-none tracking-tight">
                  1. Entrega
                </h2>
                <p className="text-sm leading-5 text-muted-foreground">
                  Elegí cómo querés recibir la compra.
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div id="shippingMethod" tabIndex={-1} aria-invalid={Boolean(fieldErrors.shippingMethod)}>
                  {canChooseShipping ? (
                    <RadioGroup
                      aria-label="Método de entrega"
                      value={formData.shippingMethod}
                      onValueChange={(value) => {
                        checkoutRequestId.current = null;
                        setFieldErrors((current) => ({ ...current, shippingMethod: undefined }));
                        setFormData((current) => ({ ...current, shippingMethod: value as DeliveryMethod }));
                      }}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <DeliveryOption id="pickup" icon={Store} title="Retiro coordinado" description={pickupLocation} price="Sin costo" />
                      <DeliveryOption
                        id="local_delivery"
                        icon={Truck}
                        title={freeLocalDelivery ? "Envío local gratis" : "Entrega local"}
                        description={`Ledesma y localidades cercanas, desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas`}
                        price={localDeliveryCost > 0 ? formatPrice(localDeliveryCost) : "Sin costo"}
                      />
                    </RadioGroup>
                  ) : hasAvailableShippingMethod ? (
                    <div className="flex items-start gap-3 rounded-xl border border-gloria-200 bg-gloria-50 p-4">
                      {formData.shippingMethod === "pickup" ? (
                        <Store className="mt-0.5 size-5 shrink-0 text-gloria-700" aria-hidden="true" />
                      ) : (
                        <Truck className="mt-0.5 size-5 shrink-0 text-gloria-700" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-black text-gloria-950">
                          {formData.shippingMethod === "pickup"
                            ? "Retiro coordinado, sin costo"
                            : freeLocalDelivery
                              ? "Envío local gratis"
                              : `Entrega local: ${formatPrice(localDeliveryCost)}`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formData.shippingMethod === "pickup" ? pickupLocation : "Ledesma y localidades cercanas"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {fieldErrors.shippingMethod ? (
                    <p className="mt-3 text-sm font-semibold text-destructive" role="alert">{fieldErrors.shippingMethod}</p>
                  ) : null}
                  {!hasAvailableShippingMethod ? (
                    <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950" role="alert">
                      No hay un método disponible para este carrito. Volvé al <Link href="/cart" className="underline underline-offset-4">carrito</Link> y sumá otra prenda o consultanos antes de pagar.
                    </p>
                  ) : null}
                  {settings.local_delivery_enabled && !canChooseShipping ? (
                    <p data-testid="local-delivery-condition" className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold leading-6">
                      {localDeliveryAvailable
                        ? freeLocalDelivery
                          ? `Tu compra de ${itemCount} prendas tiene envío local gratis en Ledesma. También podés retirar sin costo.`
                          : `Tu compra de ${itemCount} prendas habilita entrega local en Ledesma. También podés retirar sin costo.`
                        : `La entrega local en Ledesma se habilita desde ${LOCAL_DELIVERY_MIN_ITEMS} prendas. Con una sola prenda, el pedido se retira de forma coordinada.`}
                    </p>
                  ) : null}
                </div>

                {needsAddress ? (
                  <div className="space-y-5 border-t pt-5">
                    {addresses.length > 0 ? (
                      <div>
                        <p className="mb-3 font-bold">Dirección de entrega</p>
                        <RadioGroup value={selectedAddressId} onValueChange={handleAddressSelect} className="grid gap-3 sm:grid-cols-2">
                          {addresses.map((address) => (
                            <div key={address.id}>
                              <RadioGroupItem value={address.id} id={`address-${address.id}`} className="peer sr-only" />
                              <Label htmlFor={`address-${address.id}`} className="flex min-h-24 cursor-pointer flex-col rounded-xl border p-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                                <span className="font-bold">{address.name}</span>
                                <span className="mt-1 text-sm text-muted-foreground">{address.street}, {address.city}</span>
                                {selectedAddressId === address.id ? (
                                  <span className="mt-2 text-xs font-black text-primary">Dirección confirmada</span>
                                ) : null}
                              </Label>
                            </div>
                          ))}
                          <div>
                            <RadioGroupItem value="manual" id="address-manual" className="peer sr-only" />
                            <Label htmlFor="address-manual" className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5">
                              <MapPin className="size-5" aria-hidden="true" />
                              Cargar otra dirección
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    ) : null}

                    {selectedAddressId === "manual" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <FormField label="Calle y número" name="street" value={formData.street} onChange={handleInputChange} error={fieldErrors.street} autoComplete="street-address" />
                        </div>
                        <FormField label="Localidad" name="city" value={formData.city} onChange={handleInputChange} error={fieldErrors.city} autoComplete="address-level2" />
                        <FormField label="Referencia (opcional)" name="references" value={formData.references} onChange={handleInputChange} error={fieldErrors.references} placeholder="Barrio, entre calles..." />
                        {shouldOfferSaveAddress ? (
                          <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
                            <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} />
                            Guardar esta dirección para futuras compras
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="border-t pt-5">
                    <p className="font-bold">Retiro de la compra online</p>
                    <p className="mt-1 text-sm font-semibold">{pickupLocation}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{settings.pickup_instructions}</p>
                    {pickupConfigured ? (
                      <a href={pickupMapsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 bg-background px-4 text-sm font-bold text-primary hover:bg-primary/5">
                        <MapPin className="size-4" aria-hidden="true" />
                        Cómo llegar
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                )}
              </CardContent>
          </section>

          <section
            aria-labelledby="checkout-contact-title"
            className="rounded-xl border bg-card text-card-foreground shadow"
          >
              <CardHeader>
                <h2 id="checkout-contact-title" className="font-semibold leading-none tracking-tight">
                  2. Tus datos
                </h2>
                <p className="text-sm leading-5 text-muted-foreground">Usamos tu WhatsApp para confirmar y coordinar el pedido.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField label="Nombre y apellido de quien realiza la compra" name="fullName" value={formData.fullName} onChange={handleInputChange} autoComplete="name" error={fieldErrors.fullName} placeholder="Ej. María López" />
                <FormField
                  label="WhatsApp"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  onBlur={() => validateContactField("phone")}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Ej. 388 4123456"
                  hint="Incluí el código de área. Aceptamos +54 9 y formatos antiguos con 0 y 15."
                  error={fieldErrors.phone}
                />
                <button type="button" onClick={() => setIsEmailOpen((open) => !open)} aria-expanded={isEmailOpen} aria-controls="checkout-email-field" className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <ChevronDown className={`size-4 transition-transform ${isEmailOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  {isEmailOpen ? "Ocultar email" : "Agregar email (opcional)"}
                </button>
                {isEmailOpen ? (
                  <div id="checkout-email-field">
                    <FormField label="Email (opcional)" name="email" type="email" value={formData.email} onChange={handleInputChange} onBlur={() => validateContactField("email")} autoComplete="email" error={fieldErrors.email} hint="Si lo agregás, también recibirás las novedades por email." />
                  </div>
                ) : null}
              </CardContent>
          </section>

          <section
            aria-labelledby="checkout-review-title"
            className="rounded-xl border bg-card text-card-foreground shadow"
          >
              <CardHeader>
                <h2 id="checkout-review-title" className="font-semibold leading-none tracking-tight">
                  3. Revisá y continuá al pago
                </h2>
                <p className="text-sm leading-5 text-muted-foreground">El importe es el mismo con cualquier método.</p>
              </CardHeader>
              <CardContent className="space-y-5">
                <RadioGroup
                  aria-label="Procesador de pago"
                  value={paymentProvider}
                  onValueChange={(value) => {
                    setPaymentProvider(value as PaymentProvider);
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {enabledPaymentProviders.includes("mercadopago") ? (
                    <PaymentProviderOption
                      id="mercadopago"
                      name="Mercado Pago"
                      description="Tarjetas y dinero disponible"
                      imageSrc="/payment-methods/mercadopago.svg"
                    />
                  ) : null}
                  {enabledPaymentProviders.includes("viumi") ? (
                    <PaymentProviderOption
                      id="viumi"
                      name="viüMi"
                      description="Pago seguro con viüMi"
                    />
                  ) : null}
                  {enabledPaymentProviders.includes("bank_transfer") ? (
                    <PaymentProviderOption
                      id="bank_transfer"
                      name="Transferencia bancaria"
                      description="Mismo precio · confirmación manual"
                    />
                  ) : null}
                </RadioGroup>
                {enabledPaymentProviders.length === 0 ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="alert">
                    Los pagos están temporalmente deshabilitados. Contactanos para completar tu compra.
                  </p>
                ) : null}
                <div className="rounded-xl border">
                  <button type="button" onClick={() => setIsCouponOpen((open) => !open)} aria-expanded={isCouponOpen} aria-controls="checkout-coupon-content" className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                    <span>Agregar cupón <span className="font-normal text-muted-foreground">(opcional)</span></span>
                    <ChevronDown className={`size-5 transition-transform ${isCouponOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  {isCouponOpen ? (
                    <div id="checkout-coupon-content" className="space-y-4 border-t p-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <FormField label="Código" name="couponCode" value={formData.couponCode} onChange={handleInputChange} placeholder="Ingresá tu código" error={fieldErrors.couponCode} />
                        <Button type="button" variant="outline" className="min-h-12 px-6 text-base font-bold" onClick={handleApplyCoupon} disabled={isApplyingCoupon || !formData.couponCode.trim()}>
                          {isApplyingCoupon ? "Validando..." : "Aplicar"}
                        </Button>
                      </div>
                      {couponFeedback?.type === "success" ? (
                        <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold leading-6 text-primary">{couponFeedback.message}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="lg:hidden">{trustContent}</div>
                <p className="text-xs leading-5 text-muted-foreground lg:hidden">
                  El stock se reserva durante {paymentProvider === "bank_transfer" ? "2 horas" : "30 minutos"}. Al continuar aceptás los <Link href="/terminos" className="font-semibold underline">términos de compra</Link> y la <Link href="/privacidad" className="font-semibold underline">política de privacidad</Link>.
                </p>

                {error ? (
                  <div id="checkout-error" role="alert" tabIndex={-1} className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                    <p className="font-bold">No pudimos continuar</p>
                    <p>{error}</p>
                    <p className="mt-1">Revisá tu conexión y volvé a intentarlo. Tus datos siguen cargados.</p>
                  </div>
                ) : null}
              </CardContent>
          </section>
        </form>

        <aside className="hidden h-fit lg:sticky lg:top-20 lg:block" aria-label="Resumen y pago">
          <Card>
            <CardHeader className="pb-4">
              <h2 className="font-semibold leading-none tracking-tight">Resumen de tu compra</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              {summaryContent}
              {trustContent}
              <Button
                className="min-h-14 w-full rounded-xl border border-[#0089c7] bg-[#009ee3] px-4 text-base font-extrabold text-white shadow-[0_8px_20px_-10px_rgba(0,158,227,0.9)] hover:bg-[#008fce] focus-visible:ring-2 focus-visible:ring-[#009ee3] focus-visible:ring-offset-2"
                size="lg"
                type="submit"
                form={formId}
                data-testid="checkout-submit"
                onClick={handleCheckoutCtaClick}
                disabled={checkoutDisabled}
              >
                <PaymentButtonContent isProcessing={isProcessing} provider={paymentProvider} />
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                El stock se reserva durante {paymentProvider === "bank_transfer" ? "2 horas" : "30 minutos"}. Al continuar aceptás los <Link href="/terminos" className="font-semibold underline">términos de compra</Link> y la <Link href="/privacidad" className="font-semibold underline">política de privacidad</Link>.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gloria-200 bg-background/98 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_45px_-28px_oklch(0.2_0.045_136/0.55)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md gap-2">
          <div className="flex items-center justify-between gap-4 px-1">
            <span className="text-sm font-bold text-muted-foreground">Total</span>
            <strong className="text-xl font-black text-gloria-950">{formatPrice(total)}</strong>
          </div>
          <Button
            className="min-h-12 w-full rounded-xl border border-[#0089c7] bg-[#009ee3] px-3 text-sm font-extrabold text-white shadow-[0_8px_20px_-10px_rgba(0,158,227,0.9)] hover:bg-[#008fce] focus-visible:ring-2 focus-visible:ring-[#009ee3] focus-visible:ring-offset-2"
            type="submit"
            form={formId}
            data-testid="checkout-submit-mobile"
            onClick={handleCheckoutCtaClick}
            disabled={checkoutDisabled}
          >
            <PaymentButtonContent isProcessing={isProcessing} provider={paymentProvider} />
          </Button>
        </div>
      </div>
    </main>
  );
}

function PaymentProviderOption({
  id,
  name,
  description,
  imageSrc,
}: {
  id: PaymentProvider;
  name: string;
  description: string;
  imageSrc?: string;
}) {
  return (
    <div>
      <RadioGroupItem value={id} id={`payment-${id}`} className="peer sr-only" />
      <Label
        htmlFor={`payment-${id}`}
        className="flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border p-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          {imageSrc ? (
            <Image src={imageSrc} alt="" width={30} height={22} aria-hidden="true" />
          ) : id === "bank_transfer" ? (
            <Landmark className="size-5 text-gloria-800" aria-hidden="true" />
          ) : (
            <span className="text-xs font-black text-violet-700">viüMi</span>
          )}
        </span>
        <span>
          <span className="block font-black">{name}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        </span>
      </Label>
    </div>
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
