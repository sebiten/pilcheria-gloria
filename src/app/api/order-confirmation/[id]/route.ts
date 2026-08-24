import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mercadopago/client";
import { applyMercadoPagoPayment } from "@/lib/orders/payment-state";
import { findMercadoPagoPaymentForOrder } from "@/lib/mercadopago/reconciliation";
import { sendOrderEmail } from "@/lib/notifications/email";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import {
  getOrderConfirmationCookieName,
  getOrderPaymentReturnCookieName,
  guestAccessTokenMatches,
} from "@/lib/orders/confirmation-access";

interface ConfirmationRouteContext {
  params: Promise<{ id: string }>;
}

const ACCESS_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const PAYMENT_RETURN_COOKIE_MAX_AGE = 10 * 60;

function setOrderAccessCookie(
  response: NextResponse,
  orderId: string,
  guestToken: string | null
) {
  if (!guestToken) return;
  response.cookies.set(getOrderConfirmationCookieName(orderId), guestToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
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
  const returnedExternalReference =
    requestUrl.searchParams.get("external_reference");
  const paymentCookieName = getOrderPaymentReturnCookieName(id);
  let paymentId =
    requestUrl.searchParams.get("payment_id") ||
    request.cookies.get(paymentCookieName)?.value ||
    "";
  const retryRequested = requestUrl.searchParams.get("retry") === "1";

  if (returnedExternalReference && returnedExternalReference !== id) {
    cleanUrl.searchParams.set("verification", "failed");
    return NextResponse.redirect(cleanUrl, 303);
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("guest_access_token, guest_access_token_hash, clerk_user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) {
    cleanUrl.searchParams.set("verification", "failed");
    return NextResponse.redirect(cleanUrl, 303);
  }
  const orderAccessCookie = request.cookies.get(
    getOrderConfirmationCookieName(id)
  )?.value;
  const { userId } = await auth();
  const ownsSignedOrder = Boolean(
    order.clerk_user_id && userId === order.clerk_user_id
  );
  const ownsGuestOrder = Boolean(
    orderAccessCookie &&
      guestAccessTokenMatches(
        orderAccessCookie,
        order.guest_access_token_hash,
        order.guest_access_token
      )
  );
  const hasOrderAccess = ownsSignedOrder || ownsGuestOrder;

  if (
    legacyToken &&
    guestAccessTokenMatches(
      legacyToken,
      order.guest_access_token_hash,
      order.guest_access_token
    )
  ) {
    const response = NextResponse.redirect(cleanUrl, 303);
    setOrderAccessCookie(response, id, legacyToken);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (!paymentId && retryRequested && hasOrderAccess) {
    try {
      const selection = await findMercadoPagoPaymentForOrder(id);
      paymentId = selection.payment?.id ? String(selection.payment.id) : "";
    } catch (searchError) {
      console.error("No se pudo buscar el pago por referencia externa:", {
        orderId: id,
        error: searchError,
      });
      cleanUrl.searchParams.set("verification", "pending");
      return NextResponse.redirect(cleanUrl, 303);
    }
  }

  if (!/^\d{1,32}$/.test(paymentId)) {
    cleanUrl.searchParams.set(
      "verification",
      retryRequested && hasOrderAccess ? "pending" : "failed"
    );
    const response = NextResponse.redirect(cleanUrl, 303);
    clearPaymentReturnCookie(response, id);
    return response;
  }

  try {
    const payment = await getPayment(paymentId);
    const supportedPaymentStatus = [
      "approved",
      "rejected",
      "cancelled",
      "pending",
      "in_process",
    ].includes(payment.status);
    if (
      String(payment.id) !== paymentId ||
      !supportedPaymentStatus ||
      payment.external_reference !== id
    ) {
      cleanUrl.searchParams.set("verification", "failed");
      const response = NextResponse.redirect(cleanUrl, 303);
      clearPaymentReturnCookie(response, id);
      return response;
    }

    const selection = await findMercadoPagoPaymentForOrder(id, payment);
    if (!selection.payment) {
      throw new Error("No se encontró un pago conciliable");
    }
    const nextStatus = await applyMercadoPagoPayment(id, selection.payment, {
      source: "buyer_return",
      ambiguous: selection.ambiguous,
      candidatePaymentIds: selection.candidatePaymentIds,
    });
    const emailEvent =
      nextStatus === "paid"
        ? "payment-approved"
        : nextStatus === "payment_review"
          ? "payment-review"
          : nextStatus === "cancelled"
            ? "cancelled"
          : null;

    if (emailEvent) {
      after(async () => {
        await sendOrderEmail(id, emailEvent).catch((notificationError) => {
          console.error(
            "No se pudo enviar la notificación del retorno de Mercado Pago:",
            notificationError
          );
        });
      });
    }

    revalidateProductCacheFromRouteHandler();
    cleanUrl.searchParams.set(
      "payment",
      payment.status === "approved"
        ? "confirmed"
        : ["rejected", "cancelled"].includes(payment.status)
          ? "rejected"
          : "pending"
    );
    const response = NextResponse.redirect(cleanUrl, 303);
    setOrderAccessCookie(response, id, orderAccessCookie ?? legacyToken);
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
