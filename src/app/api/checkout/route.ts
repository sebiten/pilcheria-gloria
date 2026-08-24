import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, startOrderPayment } from "@/actions/orders";
import {
  CheckoutRateLimitError,
  enforceCheckoutRateLimit,
} from "@/lib/security/checkout-rate-limit";
import {
  isValidArgentinaContactPhone,
  normalizeArgentinaWhatsAppPhone,
} from "@/lib/contact";
import { getOrderConfirmationCookieName } from "@/lib/orders/confirmation-access";
import { getCheckoutRouteCapability } from "@/lib/security/checkout-capability";
import type { CheckoutRouteCapability } from "@/lib/security/checkout-capability";
import { getEnabledPaymentProviders } from "@/lib/payments/providers";

const checkoutSchema = z.object({
  paymentProvider: z.enum(["mercadopago", "viumi"]),
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .regex(/^[\x21-\x7e]+$/)
    .nullable()
    .optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(10),
      })
    )
    .min(1)
    .max(20)
    .refine(
      (items) => items.reduce((total, item) => total + item.quantity, 0) <= 20,
      { message: "El checkout admite hasta 20 prendas por pedido" }
    ),
  expectedSubtotal: z.number().finite().nonnegative(),
  analyticsSessionId: z.string().uuid().nullable().optional(),
  shippingMethod: z.enum(["pickup", "local_delivery"]),
  shippingAddress: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).nullable().optional(),
    phone: z
      .string()
      .trim()
      .max(32)
      .refine(isValidArgentinaContactPhone, {
        message: "Ingresá un teléfono válido con código de área.",
      }),
    street: z.string().trim().max(180).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().max(100).nullable().optional(),
    zip: z.string().trim().max(20).nullable().optional(),
    references: z.string().trim().max(300).nullable().optional(),
  }),
  couponCode: z.string().trim().max(50).optional(),
});

const SAFE_CHECKOUT_ERROR =
  /carrito|producto|variante|stock|cantidad|precio|total|cup[oó]n|subtotal|retiro|entrega|direcci[oó]n|tel[eé]fono|tienda todav[ií]a|intento de compra|mercado pago|procesador|seguridad/i;

export async function POST(request: Request) {
  try {
    const checkoutRequestId = z
      .string()
      .uuid()
      .parse(request.headers.get("idempotency-key"));
    const body = checkoutSchema.parse(await request.json());
    if (!getEnabledPaymentProviders().includes(body.paymentProvider)) {
      throw new Error("El procesador de pago elegido no está disponible.");
    }
    const requestFingerprint = await enforceCheckoutRateLimit(request);

    const capability: CheckoutRouteCapability = getCheckoutRouteCapability();
    const result = await createOrder(
      {
        ...body,
        shippingAddress: {
          ...body.shippingAddress,
          phone: normalizeArgentinaWhatsAppPhone(body.shippingAddress.phone),
        },
        checkoutRequestId,
        requestFingerprint,
      },
      capability
    );
    const attempt = await startOrderPayment(
      result.order.id,
      body.paymentProvider,
      capability,
      body.deviceId
    );

    const response = NextResponse.json({
      orderId: result.order.id,
      payment: {
        provider: attempt.provider,
        checkoutUrl: attempt.checkout_url,
      },
      preference: { init_point: String(attempt.checkout_url) },
    });
    const guestToken = result.order?.guest_access_token;

    if (guestToken) {
      response.cookies.set(
        getOrderConfirmationCookieName(result.order.id),
        guestToken,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          priority: "high",
          maxAge: 7 * 24 * 60 * 60,
        }
      );
    }

    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Checkout error:", error);

    if (error instanceof CheckoutRateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        }
      );
    }

    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Los datos del checkout no son válidos." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error && SAFE_CHECKOUT_ERROR.test(error.message)
        ? error.message
        : "No se pudo iniciar el pago. Intentá nuevamente.";

    return NextResponse.json(
      { error: message },
      { status: message === "No se pudo iniciar el pago. Intentá nuevamente." ? 500 : 422 }
    );
  }
}
