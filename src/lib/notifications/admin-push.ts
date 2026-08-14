import "server-only";

import webPush, { type PushSubscription } from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";

const PUSH_TIMEOUT_MS = 8_000;

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:sebaburgos9@gmail.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export async function sendAdminSalePush(orderId: string) {
  const vapid = getVapidConfig();
  if (!vapid) return;

  const supabase = getSupabaseAdmin();
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_admin_sale_push",
    { p_order_id: orderId }
  );

  if (claimError) throw new Error(claimError.message);
  if (!claimed) return;

  try {
    const [{ data: order, error: orderError }, { data: subscriptions, error: subscriptionsError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select("total, shipping_address")
          .eq("id", orderId)
          .single(),
        supabase
          .from("admin_push_subscriptions")
          .select("id, endpoint, p256dh, auth"),
      ]);

    if (orderError || !order) throw orderError ?? new Error("Pedido no encontrado");
    if (subscriptionsError) throw new Error(subscriptionsError.message);
    if (!subscriptions?.length) {
      await releasePushClaim(orderId);
      return;
    }

    const address = order.shipping_address as Record<string, unknown> | null;
    const customerName =
      typeof address?.name === "string" && address.name.trim()
        ? address.name.trim()
        : "Cliente";
    const payload = JSON.stringify({
      title: "Nueva venta aprobada",
      body: `${customerName} · ${formatPrice(Number(order.total))}`,
      url: `/dashboard/orders/${orderId}`,
      tag: `venta-${orderId}`,
    });

    webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    let delivered = false;
    const expiredIds: string[] = [];

    await Promise.all(
      (subscriptions as PushSubscriptionRow[]).map(async (row) => {
        const subscription: PushSubscription = {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        };
        try {
          await webPush.sendNotification(subscription, payload, {
            TTL: 60 * 60,
            urgency: "high",
            timeout: PUSH_TIMEOUT_MS,
          });
          delivered = true;
        } catch (error) {
          const statusCode =
            typeof error === "object" && error && "statusCode" in error
              ? Number(error.statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) expiredIds.push(row.id);
          else console.error("No se pudo enviar una notificación push:", error);
        }
      })
    );

    if (expiredIds.length) {
      await supabase.from("admin_push_subscriptions").delete().in("id", expiredIds);
    }

    if (delivered) {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("event_key", "sale_paid");
      if (error) throw new Error(error.message);
    } else {
      await releasePushClaim(orderId);
    }
  } catch (error) {
    await releasePushClaim(orderId).catch(() => undefined);
    throw error;
  }
}

async function releasePushClaim(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_notifications")
    .update({ push_claimed_at: null })
    .eq("order_id", orderId)
    .eq("event_key", "sale_paid")
    .is("push_sent_at", null);
  if (error) throw new Error(error.message);
}
