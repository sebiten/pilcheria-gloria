import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mercadopago/client";
import { applyMercadoPagoPayment } from "@/lib/orders/payment-state";
import { sendOrderEmail } from "@/lib/notifications/email";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import {
  getOrderConfirmationCookieName,
  getOrderPaymentReturnCookieName,
  secureTokenEquals,
} from "@/lib/orders/confirmation-access";

interface ConfirmationRouteContext {
  params: Promise<{ id: string }>;
}

const ACCESS_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const PAYMENT_RETURN_COOKIE_MAX_AGE = 10 * 60;

function setOrderAccessCookie(
  response: NextResponse,
  orderId: string,
  guestToken: string
) {
  response.cookies.set(getOrderConfirmationCookieName(orderId), guestToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/order-confirmation/${orderId}`,
    priority: "high",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
}

function clearPaymentReturnCookie(response: NextResponse, orderId: string) {
  response.cookies.set(getOrderPaymentReturnCookieName(orderId), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/api/order-confirmation/${orderId}`,
    maxAge: 0,
  });
}

export async function GET(
  request: NextRequest,
  context: ConfirmationRouteContext
) {
  const { id: rawId } = await context.params;
  const parsedId = z.string().uuid().safeParse(rawId);
  const requestUrl = new URL(request.url);
  const cleanUrl = new URL(
    `/order-confirmation/${encodeURIComponent(rawId)}`,
    request.url
  );

  if (!parsedId.success) {
    return NextResponse.redirect(new URL("/uniformes", request.url), 303);
  }

  const id = parsedId.data;
  const legacyToken = requestUrl.searchParams.get("token");
  const paymentCookieName = getOrderPaymentReturnCookieName(id);
  const paymentId =
    requestUrl.searchParams.get("payment_id") ||
    request.cookies.get(paymentCookieName)?.value ||
    "";

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("guest_access_token")
    .eq("id", id)
    .maybeSingle();

  const guestToken = order?.guest_access_token;
  if (error || !guestToken) {
    cleanUrl.searchParams.set("verification", "failed");
    return NextResponse.redirect(cleanUrl, 303);
  }

  if (legacyToken && secureTokenEquals(legacyToken, guestToken)) {
    const response = NextResponse.redirect(cleanUrl, 303);
    setOrderAccessCookie(response, id, guestToken);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (!/^\d{1,32}$/.test(paymentId)) {
    cleanUrl.searchParams.set("verification", "failed");
    const response = NextResponse.redirect(cleanUrl, 303);
    clearPaymentReturnCookie(response, id);
    return response;
  }

  try {
    const payment = await getPayment(paymentId);
    if (
      String(payment.id) !== paymentId ||
      payment.status !== "approved" ||
      payment.external_reference !== id
    ) {
      cleanUrl.searchParams.set("verification", "failed");
      const response = NextResponse.redirect(cleanUrl, 303);
      clearPaymentReturnCookie(response, id);
      return response;
    }

    const nextStatus = await applyMercadoPagoPayment(id, payment);
    const emailEvent =
      nextStatus === "paid"
        ? "payment-approved"
        : nextStatus === "payment_review"
          ? "payment-review"
          : null;

    if (emailEvent) {
      await sendOrderEmail(id, emailEvent).catch((notificationError) => {
        console.error(
          "No se pudo enviar la notificación del retorno de Mercado Pago:",
          notificationError
        );
      });
    }

    revalidateProductCacheFromRouteHandler();
    cleanUrl.searchParams.set("payment", "confirmed");
    const response = NextResponse.redirect(cleanUrl, 303);
    setOrderAccessCookie(response, id, guestToken);
    clearPaymentReturnCookie(response, id);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (paymentError) {
    console.error("No se pudo verificar el retorno de Mercado Pago:", {
      orderId: id,
      paymentId,
      error: paymentError,
    });
    cleanUrl.searchParams.set("verification", "pending");
    const response = NextResponse.redirect(cleanUrl, 303);
    response.cookies.set(paymentCookieName, paymentId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/order-confirmation/${id}`,
      priority: "high",
      maxAge: PAYMENT_RETURN_COOKIE_MAX_AGE,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
