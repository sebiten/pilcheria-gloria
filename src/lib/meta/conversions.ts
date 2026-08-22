import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";

const META_GRAPH_API_VERSION = "v23.0";
const META_TIMEOUT_MS = 8_000;

type MetaUserData = {
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
  external_id?: string[];
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
};

type MetaCustomData = {
  content_ids?: string[];
  content_type?: "product";
  content_name?: string;
  currency?: "ARS";
  value?: number;
  num_items?: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("es-AR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  return digits.startsWith("54") ? digits : `54${digits.replace(/^15/, "")}`;
}

export function hashMetaExternalId(value: string) {
  return sha256(value.trim().toLocaleLowerCase("es-AR"));
}

export async function sendMetaConversion({
  eventName,
  eventId,
  eventSourceUrl,
  userData,
  customData,
}: {
  eventName: string;
  eventId: string;
  eventSourceUrl: string;
  userData: MetaUserData;
  customData?: MetaCustomData;
}) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;

  if (!pixelId || !accessToken || !/^\d{5,32}$/.test(pixelId)) {
    return { configured: false as const };
  }

  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events`
  );
  url.searchParams.set("access_token", accessToken);
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1_000),
        event_id: eventId,
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data: userData,
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(META_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Meta CAPI rechazó el evento (${response.status})`);
  }

  return { configured: true as const };
}

export async function sendMetaPurchaseEvent(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, total, analytics_session_id, shipping_address, order_items(product_id, quantity)")
    .eq("id", orderId)
    .single();

  if (error || !order) throw error ?? new Error("Orden no encontrada para Meta");

  const address = (order.shipping_address ?? {}) as {
    name?: string;
    email?: string | null;
    phone?: string;
  };
  const names = address.name?.trim().split(/\s+/) ?? [];
  const email = address.email ? normalizeText(address.email) : "";
  const phone = address.phone ? normalizePhone(address.phone) : "";
  const firstName = names[0] ? normalizeText(names[0]) : "";
  const lastName = names.length > 1 ? normalizeText(names.slice(1).join(" ")) : "";
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const contentIds = Array.from(
    new Set(items.flatMap((item) => (item.product_id ? [item.product_id] : [])))
  );

  return sendMetaConversion({
    eventName: "Purchase",
    eventId: `purchase_${order.id}`,
    eventSourceUrl: `${getSiteUrl()}/order-confirmation/${order.id}`,
    userData: {
      ...(order.analytics_session_id
        ? { external_id: [hashMetaExternalId(order.analytics_session_id)] }
        : {}),
      ...(email ? { em: [sha256(email)] } : {}),
      ...(phone ? { ph: [sha256(phone)] } : {}),
      ...(firstName ? { fn: [sha256(firstName)] } : {}),
      ...(lastName ? { ln: [sha256(lastName)] } : {}),
    },
    customData: {
      content_ids: contentIds,
      content_type: "product",
      currency: "ARS",
      value: Number(order.total),
      num_items: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    },
  });
}
