import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/actions/orders";
import {
  CheckoutRateLimitError,
  enforceCheckoutRateLimit,
} from "@/lib/security/checkout-rate-limit";
import { isValidArgentinaContactPhone } from "@/lib/contact";

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable(),
        quantity: z.number().int().min(1).max(10),
      })
    )
    .min(1)
    .max(20),
  expectedSubtotal: z.number().finite().nonnegative(),
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
  /carrito|producto|variante|stock|cantidad|precio|total|cup[oó]n|subtotal|retiro|entrega|direcci[oó]n|tel[eé]fono|tienda todav[ií]a|intento de compra/i;

export async function POST(request: Request) {
  try {
    const checkoutRequestId = z
      .string()
      .uuid()
      .parse(request.headers.get("idempotency-key"));
    const body = checkoutSchema.parse(await request.json());
    const requestFingerprint = await enforceCheckoutRateLimit(request);

    const result = await createOrder({
      ...body,
      checkoutRequestId,
      requestFingerprint,
    });

    return NextResponse.json(result);
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
