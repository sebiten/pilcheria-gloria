"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sendWithdrawalReceipt } from "@/lib/notifications/email";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const withdrawalSchema = z.object({
  orderReference: z.string().trim().min(4).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(6).max(40),
  reason: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(),
});

function createRequestCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `ARREP-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createWithdrawalRequest(
  input: z.infer<typeof withdrawalSchema>
) {
  const payload = withdrawalSchema.parse(input);
  const supabase = getSupabaseAdmin();
  const requestCode = createRequestCode();
  const normalizedEmail = payload.email.toLowerCase();
  const normalizedPhone = payload.phone.replace(/\D/g, "");
  if (normalizedPhone.length < 6 || normalizedPhone.length > 20) {
    throw new Error("Ingresá un teléfono válido.");
  }
  const requestedOrderId = z.string().uuid().safeParse(payload.orderReference);
  let verifiedOrderId: string | null = null;

  if (requestedOrderId.success) {
    const { data: order } = await supabase
      .from("orders")
      .select("id, shipping_address")
      .eq("id", requestedOrderId.data)
      .maybeSingle();
    const address = order?.shipping_address as {
      email?: string | null;
      phone?: string | null;
    } | null;
    const orderEmail = address?.email?.trim().toLowerCase();
    const orderPhone = address?.phone?.replace(/\D/g, "");

    if (
      order &&
      ((orderEmail && orderEmail === normalizedEmail) ||
        (orderPhone && orderPhone === normalizedPhone))
    ) {
      verifiedOrderId = order.id;
    }
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [{ data: recentEmailRequest }, { data: recentPhoneRequest }] =
    await Promise.all([
      supabase
        .from("withdrawal_requests")
        .select("id")
        .eq("email", normalizedEmail)
        .gte("created_at", fiveMinutesAgo)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("withdrawal_requests")
        .select("id")
        .eq("phone", normalizedPhone)
        .gte("created_at", fiveMinutesAgo)
        .limit(1)
        .maybeSingle(),
    ]);

  if (recentEmailRequest || recentPhoneRequest) {
    throw new Error("Ya recibimos una solicitud reciente con este email.");
  }

  const { error } = await supabase.from("withdrawal_requests").insert({
    request_code: requestCode,
    order_id: verifiedOrderId,
    order_reference: payload.orderReference,
    email: normalizedEmail,
    phone: normalizedPhone,
    reason: payload.reason || null,
  });

  if (error) {
    throw new Error("No se pudo registrar la solicitud. Intentá nuevamente.");
  }

  await sendWithdrawalReceipt({
    requestCode,
    email: normalizedEmail,
    orderReference: payload.orderReference,
  }).catch((notificationError) => {
    console.error("No se pudo enviar el comprobante de arrepentimiento:", notificationError);
  });

  return { requestCode };
}
