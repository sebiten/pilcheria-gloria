"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";

const notificationIdSchema = z.string().uuid();
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(4096),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export type AdminSaleNotification = {
  id: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  totalLabel: string;
  createdLabel: string;
  read: boolean;
};

export type AdminNotificationState = {
  notifications: AdminSaleNotification[];
  unreadCount: number;
};

type NotificationRow = {
  id: string;
  order_id: string;
  read_at: string | null;
  created_at: string;
  orders:
    | { total: string | number; shipping_address: Record<string, unknown> | null }
    | Array<{ total: string | number; shipping_address: Record<string, unknown> | null }>;
};

export async function getAdminSaleNotifications(): Promise<AdminNotificationState> {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select("id, order_id, read_at, created_at, orders!inner(total, shipping_address)")
      .eq("event_key", "sale_paid")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("event_key", "sale_paid")
      .is("read_at", null),
  ]);

  if (error) throw new Error(error.message);
  if (countError) throw new Error(countError.message);

  const dateFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Jujuy",
  });

  const notifications = ((data ?? []) as NotificationRow[]).map((row) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const address = order?.shipping_address;
    const customerName =
      typeof address?.name === "string" && address.name.trim()
        ? address.name.trim()
        : "Cliente";

    return {
      id: row.id,
      orderId: row.order_id,
      orderCode: row.order_id.slice(0, 8).toUpperCase(),
      customerName,
      totalLabel: formatPrice(Number(order?.total ?? 0)),
      createdLabel: dateFormatter.format(new Date(row.created_at)),
      read: Boolean(row.read_at),
    };
  });

  return { notifications, unreadCount: count ?? 0 };
}

export async function markAdminSaleNotificationRead(id: string) {
  await requireAdmin();
  const safeId = notificationIdSchema.parse(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", safeId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function markAllAdminSaleNotificationsRead() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("event_key", "sale_paid")
    .is("read_at", null);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getAdminPushPublicKey() {
  await requireAdmin();
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function saveAdminPushSubscription(input: unknown) {
  await requireAdmin();
  const { userId } = await auth();
  if (!userId) throw new Error("Usuario no autenticado");
  const subscription = pushSubscriptionSchema.parse(input);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("admin_push_subscriptions").upsert(
    {
      clerk_user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removeAdminPushSubscription(endpoint: string) {
  await requireAdmin();
  const { userId } = await auth();
  if (!userId) throw new Error("Usuario no autenticado");
  const safeEndpoint = z.string().url().startsWith("https://").max(4096).parse(endpoint);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_push_subscriptions")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("endpoint", safeEndpoint);

  if (error) throw new Error(error.message);
  return { ok: true };
}
