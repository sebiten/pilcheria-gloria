import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, getOrderForConfirmation } from "@/actions/orders";
import {
  CheckoutRateLimitError,
  enforceCheckoutRateLimit,
} from "@/lib/security/checkout-rate-limit";
import { getCheckoutRouteCapability } from "@/lib/security/checkout-capability";
import { getOrderConfirmationCookieName } from "@/lib/orders/confirmation-access";
import {
  isValidArgentinaContactPhone,
  normalizeArgentinaWhatsAppPhone,
} from "@/lib/contact";

interface RetryPaymentRouteContext {
  params: Promise<{ id: string }>;
}

const RETRYABLE_PAYMENT_STATUSES = new Set(["rejected", "cancelled"]);

export async function POST(
  request: NextRequest,
  context: RetryPaymentRouteContext
) {
  try {
    const { id: rawId } = await context.params;
    const orderId = z.string().uuid().parse(rawId);
    const checkoutRequestId = z
      .string()
      .uuid()
      .parse(request.headers.get("idempotency-key"));
    const accessToken = request.cookies.get(
      getOrderConfirmationCookieName(orderId)
    )?.value;
    const order = await getOrderForConfirmation(orderId, accessToken);

    if (
      order.status !== "cancelled" ||
      !RETRYABLE_PAYMENT_STATUSES.has(order.mercadopago_status || "")
    ) {
      return NextResponse.json(
        { error: "Este pedido no admite un nuevo intento de pago." },
        { status: 409 }
      );
    }

    const items = (order.items || []).map((item: any) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: Number(item.quantity),
    }));
    const address = order.shipping_address || {};
    if (!isValidArgentinaContactPhone(address.phone || "")) {
      return NextResponse.json(
        { error: "El WhatsApp guardado no es válido. Pedinos ayuda para corregirlo." },
        { status: 422 }
      );
    }
    const requestFingerprint = await enforceCheckoutRateLimit(request);
    const { userId } = await auth();

    const result = await createOrder(
      {
        items,
        shippingMethod: order.shipping_method || "pickup",
        shippingAddress: {
          name: address.name || "",
          email: address.email || null,
          phone: normalizeArgentinaWhatsAppPhone(address.phone),
          street: address.street || null,
          city: address.city || null,
          state: address.state || null,
          zip: address.zip || null,
          references: address.references || null,
        },
        couponCode: order.coupon_code || undefined,
        checkoutRequestId,
        requestFingerprint,
        analyticsSessionId: order.analytics_session_id || null,
      },
      getCheckoutRouteCapability()
    );

    const initPoint = result.preference?.init_point;
    if (!initPoint) {
      throw new Error("Mercado Pago no devolvió un enlace de pago");
    }

    const response = NextResponse.json({
      orderId: result.order.id,
      preference: { init_point: String(initPoint) },
    });
    const guestToken = result.order.guest_access_token;

    if (!userId && guestToken) {
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

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "El intento de pago no es válido." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error &&
      /stock|precio|disponibilidad|cup[oó]n|retiro|entrega|direcci[oó]n|tel[eé]fono/i.test(
        error.message
      )
        ? error.message
        : "No se pudo preparar el nuevo pago. Intentá nuevamente.";

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
