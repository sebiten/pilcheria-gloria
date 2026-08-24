import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrderForConfirmation } from "@/actions/orders";
import { getStoreSettings } from "@/actions/store-settings";
import { normalizeArgentinaWhatsAppPhone } from "@/lib/contact";
import { getOrderConfirmationCookieName } from "@/lib/orders/confirmation-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const orderId = z.string().uuid().parse(rawId);
    z.string().uuid().parse(request.headers.get("idempotency-key"));
    const accessToken = request.cookies.get(
      getOrderConfirmationCookieName(orderId)
    )?.value;
    const order = await getOrderForConfirmation(orderId, accessToken);
    const attempt = [...(order.payment_attempts || [])]
      .sort(
        (first: any, second: any) =>
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
      )
      .find((item: any) => item.provider === "bank_transfer");

    if (!attempt) throw new Error("No se encontró la transferencia del pedido");

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc("report_bank_transfer", {
      p_order_id: orderId,
      p_attempt_id: attempt.id,
    });
    if (error) throw new Error(error.message);

    const settings = await getStoreSettings();
    const whatsappPhone = normalizeArgentinaWhatsAppPhone(
      settings.whatsapp_phone || ""
    );
    const address = (order.shipping_address || {}) as Record<string, string>;
    const orderCode = orderId.slice(0, 8).toUpperCase();
    const message = `Hola, ya transferí el pedido ${orderCode} por $${Number(
      order.total
    ).toLocaleString("es-AR", { minimumFractionDigits: 2 })}. Comprador: ${
      address.name || "Sin nombre"
    }. Adjunto el comprobante para revisión.`;

    const response = NextResponse.json({
      whatsappUrl: `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 422;
    const message =
      error instanceof Error && /pedido|transferencia|acceso|forbidden/i.test(error.message)
        ? error.message
        : "No se pudo informar la transferencia.";
    return NextResponse.json({ error: message }, { status });
  }
}
