import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateProductCacheFromRouteHandler } from "@/lib/cache/products";
import { getPayment } from "@/lib/mercadopago/client";
import { applyMercadoPagoPayment } from "@/lib/orders/payment-state";
import { sendOrderEmail } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mercadoPagoAdapter } from "@/lib/payments/mercadopago-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  try {
    if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
      console.error("Falta MERCADOPAGO_WEBHOOK_SECRET");
      return NextResponse.json(
        { error: "Webhook no configurado" },
        { status: 503 }
      );
    }

    const signatureHeader = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    if (!signatureHeader || !requestId || requestId.length > 160) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    const url = new URL(request.url);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    let body: any = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
      }
    }
    const type = url.searchParams.get("type") || body?.type;
    const paymentId = String(
      url.searchParams.get("data.id") || body?.data?.id || body?.id || ""
    );

    if (type === "payment" && paymentId) {
      const validPaymentId =
        process.env.E2E_MERCADOPAGO_FAKE === "1"
          ? /^[0-9a-f-]{16,64}$/i.test(paymentId)
          : /^\d{1,32}$/.test(paymentId);
      if (!validPaymentId) {
        return NextResponse.json(
          { error: "Identificador de pago inválido" },
          { status: 400 }
        );
      }

      const isValidSignature = mercadoPagoAdapter.validateWebhook({
        externalId: paymentId,
        requestId,
        signature: signatureHeader,
      });

      if (!isValidSignature) {
        console.warn("Webhook Mercado Pago rechazado por firma inválida", {
          paymentId,
          hasRequestId: Boolean(request.headers.get("x-request-id")),
          hasSignature: Boolean(request.headers.get("x-signature")),
        });
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
      }

      let payment;
      if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
        const requestedStatus = request.headers.get("x-e2e-payment-status");
        const paymentStatus = ["approved", "rejected", "pending"].includes(
          requestedStatus || ""
        )
          ? requestedStatus!
          : "approved";
        const supabase = getSupabaseAdmin();
        const { data: order, error } = await supabase
          .from("orders")
          .select("total")
          .eq("id", paymentId)
          .single();

        if (error || !order) {
          throw error ?? new Error("Orden e2e no encontrada");
        }

        payment = {
          id: paymentId,
          status: paymentStatus,
          status_detail:
            request.headers.get("x-e2e-payment-status-detail") || null,
          external_reference: paymentId,
          transaction_amount: Number(order.total),
          currency_id: "ARS",
          collector_id: "e2e-collector",
        };
      } else {
        payment = await getPayment(paymentId);
      }
      const externalReference = payment.external_reference;

      if (externalReference) {
        const nextStatus = await applyMercadoPagoPayment(
          externalReference,
          payment
        );
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
            await sendOrderEmail(externalReference, emailEvent).catch(
              (notificationError) => {
              console.error(
                "No se pudo enviar la notificación del webhook:",
                notificationError
              );
              }
            );
          });
        }

        if (["paid", "payment_review", "cancelled"].includes(nextStatus)) {
          revalidateProductCacheFromRouteHandler();
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
