import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrderForConfirmation, startOrderPayment } from "@/actions/orders";
import {
  CheckoutRateLimitError,
  enforceCheckoutRateLimit,
} from "@/lib/security/checkout-rate-limit";
import { getCheckoutRouteCapability } from "@/lib/security/checkout-capability";
import { getOrderConfirmationCookieName } from "@/lib/orders/confirmation-access";
import { getEnabledPaymentProviders } from "@/lib/payments/providers";

interface RetryPaymentRouteContext {
  params: Promise<{ id: string }>;
}

const retrySchema = z.object({
  paymentProvider: z.enum(["mercadopago", "viumi"]),
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .regex(/^[\x21-\x7e]+$/)
    .nullable()
    .optional(),
});

export async function POST(
  request: NextRequest,
  context: RetryPaymentRouteContext
) {
  try {
    const { id: rawId } = await context.params;
    const orderId = z.string().uuid().parse(rawId);
    z.string().uuid().parse(request.headers.get("idempotency-key"));
    const body = retrySchema.parse(await request.json());
    const accessToken = request.cookies.get(
      getOrderConfirmationCookieName(orderId)
    )?.value;

    await getOrderForConfirmation(orderId, accessToken);
    if (!getEnabledPaymentProviders().includes(body.paymentProvider)) {
      throw new Error("El procesador de pago elegido no está disponible.");
    }
    await enforceCheckoutRateLimit(request);
    const attempt = await startOrderPayment(
      orderId,
      body.paymentProvider,
      getCheckoutRouteCapability(),
      body.deviceId
    );

    const response = NextResponse.json({
      orderId,
      payment: {
        provider: attempt.provider,
        checkoutUrl: attempt.checkout_url,
      },
      preference: { init_point: attempt.checkout_url },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Retry payment error:", error);

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
        { error: "El intento de pago no es válido." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error &&
      /pedido|pago|reserva|stock|viümi|mercado pago/i.test(error.message)
        ? error.message
        : "No se pudo preparar el nuevo pago. Intentá nuevamente.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
