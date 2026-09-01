import "server-only";

import { SITE_NAME } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { getStoreSettings } from "@/actions/store-settings";
import {
  getGoogleMapsDirectionsUrl,
  getPickupAddress,
  PICKUP_LOCATION_REFERENCE,
} from "@/lib/maps";
import { createGuestReviewLinks } from "@/lib/reviews/guest-invites";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  orderId?: string;
  eventKey?: string;
};

type OrderEmailItem = {
  product_name: string;
  variant_label: string | null;
  quantity: number;
};

type OrderEmailEvent =
  | "order-created"
  | "payment-approved"
  | "payment-review"
  | "ready-for-pickup"
  | "shipped"
  | "delivered"
  | "cancelled";

const ORDER_EMAIL_COPY: Record<
  OrderEmailEvent,
  { subject: string; heading: string; body: string }
> = {
  "order-created": {
    subject: "Terminá tu compra",
    heading: "Reservamos tus prendas por 30 minutos",
    body: "Completá el pago en el procesador elegido antes de que venza la reserva.",
  },
  "payment-approved": {
    subject: "Pago confirmado",
    heading: "Tu pago fue aprobado",
    body: "Ya estamos preparando tu pedido. Te avisaremos cuando avance.",
  },
  "payment-review": {
    subject: "Pago recibido, pedido en revisión",
    heading: "Estamos verificando tu pedido",
    body: "Recibimos el pago y estamos confirmando el stock. Te contactaremos a la brevedad.",
  },
  "ready-for-pickup": {
    subject: "Tu pedido está listo para retirar",
    heading: "Ya podés retirar tu pedido",
    body: "Acercate al punto de retiro y mostrá el código de tu pedido.",
  },
  shipped: {
    subject: "Tu pedido está en camino",
    heading: "Salimos para la entrega",
    body: "Tu compra ya está en camino a la dirección indicada.",
  },
  delivered: {
    subject: "Pedido entregado",
    heading: "Tu pedido fue entregado",
    body: "Gracias por comprar en Pilchería Gloria.",
  },
  cancelled: {
    subject: "Pedido cancelado",
    heading: "La reserva fue cancelada",
    body: "Si realizaste un pago o necesitás ayuda, escribinos por WhatsApp.",
  },
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character
  );
}

function getAdminNotificationRecipients() {
  return Array.from(
    new Set(
      (process.env.ORDER_NOTIFICATION_TO || "")
        .split(/[,;\n]/)
        .map((email) => email.trim())
        .filter(Boolean)
    )
  );
}

async function sendEmailsIndependently(inputs: EmailInput[]) {
  const results = await Promise.allSettled(inputs.map(sendEmail));
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failures.length) {
    throw new Error(`Fallaron ${failures.length} de ${inputs.length} emails`, {
      cause: failures[0].reason,
    });
  }
}

async function sendEmail(input: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    return { skipped: true };
  }

  const supabase = getSupabaseAdmin();
  if (input.orderId && input.eventKey) {
    const { data: existing } = await supabase
      .from("order_notifications")
      .select("status")
      .eq("order_id", input.orderId)
      .eq("event_key", input.eventKey)
      .eq("recipient", input.to)
      .maybeSingle();

    if (existing?.status === "sent") {
      return { skipped: true };
    }

    await supabase.from("order_notifications").upsert(
      {
        order_id: input.orderId,
        event_key: input.eventKey,
        recipient: input.to,
        status: "pending",
        error_message: null,
      },
      { onConflict: "order_id,event_key,recipient" }
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (input.orderId && input.eventKey) {
      await supabase
        .from("order_notifications")
        .update({
          status: "failed",
          error_message: JSON.stringify(result).slice(0, 1000),
        })
        .eq("order_id", input.orderId)
        .eq("event_key", input.eventKey)
        .eq("recipient", input.to);
    }

    throw new Error(`No se pudo enviar el email: ${response.status}`);
  }

  if (input.orderId && input.eventKey) {
    await supabase
      .from("order_notifications")
      .update({
        status: "sent",
        provider_id: result.id || null,
        sent_at: new Date().toISOString(),
      })
      .eq("order_id", input.orderId)
      .eq("event_key", input.eventKey)
      .eq("recipient", input.to);
  }

  return result;
}

export async function sendOrderEmail(
  orderId: string,
  event: OrderEmailEvent
) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, total, shipping_method, shipping_address, guest_access_token, guest_access_token_hash, order_items(product_name, variant_label, quantity)"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw error ?? new Error("Orden no encontrada");
  }

  const shippingAddress = order.shipping_address as {
    name?: string;
    email?: string;
    phone?: string;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  const customerEmail = shippingAddress?.email?.trim();
  const adminEmails = getAdminNotificationRecipients();
  const orderItems = (order.order_items || []) as OrderEmailItem[];

  const copy = ORDER_EMAIL_COPY[event];
  const orderCode = order.id.slice(0, 8).toUpperCase();
  const customerName = escapeHtml(shippingAddress?.name || "cliente");
  const orderItemsHtml = orderItems.length
    ? `
      <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px">
        <p style="margin:0 0 12px"><strong>Prendas:</strong></p>
        <ul style="margin:0;padding-left:20px;line-height:1.7">
          ${orderItems
            .map(
              (item) =>
                `<li>${item.quantity} × ${escapeHtml(item.product_name)}${
                  item.variant_label
                    ? ` — ${escapeHtml(item.variant_label)}`
                    : ""
                }</li>`
            )
            .join("")}
        </ul>
      </div>
    `
    : "";
  let pickupDetailsHtml = "";

  if (event === "ready-for-pickup") {
    const settings = await getStoreSettings();
    const pickupAddress = getPickupAddress(settings);
    const pickupMapsUrl = getGoogleMapsDirectionsUrl(pickupAddress);

    pickupDetailsHtml = `
      <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px;background:#f7fbf2">
        <p style="margin:0 0 8px"><strong>Punto de retiro:</strong> ${escapeHtml(pickupAddress)}</p>
        <p style="margin:0 0 8px"><a href="${escapeHtml(pickupMapsUrl)}" style="color:#35680f;font-weight:700">Cómo llegar con Google Maps</a></p>
        <p style="margin:0"><strong>Referencia:</strong> ${escapeHtml(PICKUP_LOCATION_REFERENCE)}</p>
      </div>
    `;
  }

  const isGuestOrder = Boolean(
    order.guest_access_token_hash || order.guest_access_token
  );
  const guestOrderHtml = isGuestOrder && customerEmail
    ? `
      <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px">
        <p style="margin:0 0 8px"><strong>Tu pedido está registrado aunque no tengas una cuenta.</strong></p>
        <p style="margin:0;line-height:1.6">Guardá este email y el código del pedido. Usaremos el email y teléfono que ingresaste para enviarte novedades y coordinar el retiro o la entrega.</p>
      </div>
    `
    : "";
  let reviewInvitationHtml = "";
  if (event === "delivered" && isGuestOrder && customerEmail) {
    const reviewLinks = await createGuestReviewLinks(orderId).catch((inviteError) => {
      console.error("No se pudieron crear las invitaciones de reseña:", inviteError);
      return [];
    });

    if (reviewLinks.length) {
      reviewInvitationHtml = `
        <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px;background:#f7fbf2">
          <p style="margin:0 0 8px;font-size:18px"><strong>¿Cómo te fue con las prendas?</strong></p>
          <p style="margin:0 0 14px;line-height:1.6">Tu opinión ayuda a otras familias a elegir con más confianza.</p>
          ${reviewLinks
            .map(
              (link) => `
                <p style="margin:10px 0">
                  <a href="${escapeHtml(link.url)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#35680f;color:#fff;text-decoration:none;font-weight:700">
                    Opinar sobre ${escapeHtml(link.productName)}
                  </a>
                </p>
              `
            )
            .join("")}
          <p style="margin:12px 0 0;font-size:12px;color:#54703a">Cada enlace es personal, se usa una sola vez y vence en 90 días.</p>
        </div>
      `;
    }
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17210f">
      <p style="font-size:14px;color:#54703a">${escapeHtml(SITE_NAME)}</p>
      <h1 style="font-size:28px">${escapeHtml(copy.heading)}</h1>
      <p>Hola ${customerName},</p>
      <p style="line-height:1.6">${escapeHtml(copy.body)}</p>
      <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px">
        <p style="margin:0 0 8px"><strong>Pedido:</strong> ${orderCode}</p>
        <p style="margin:0"><strong>Total:</strong> ${escapeHtml(formatPrice(Number(order.total)))}</p>
      </div>
      ${orderItemsHtml}
      ${pickupDetailsHtml}
      ${guestOrderHtml}
      ${reviewInvitationHtml}
    </div>
  `;

  const emails: EmailInput[] = [];
  if (customerEmail) {
    emails.push({
      to: customerEmail,
      subject: `${copy.subject} · ${SITE_NAME}`,
      html,
      idempotencyKey: `${event}/${orderId}/${customerEmail}`,
      orderId,
      eventKey: event,
    });
  }

  if (event === "payment-approved") {
    const deliveryMethod =
      order.shipping_method === "local_delivery"
        ? "Envío local"
        : "Retiro en el local";
    const deliveryAddress = [
      shippingAddress?.street,
      shippingAddress?.city,
      shippingAddress?.state,
      shippingAddress?.zip,
    ]
      .filter(Boolean)
      .map((value) => escapeHtml(String(value)))
      .join(", ");
    const adminHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17210f">
        <p style="font-size:14px;color:#54703a">${escapeHtml(SITE_NAME)}</p>
        <h1 style="font-size:28px">Nueva venta pagada</h1>
        <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px">
          <p style="margin:0 0 8px"><strong>Pedido:</strong> ${orderCode}</p>
          <p style="margin:0 0 8px"><strong>Total:</strong> ${escapeHtml(formatPrice(Number(order.total)))}</p>
          <p style="margin:0"><strong>Entrega:</strong> ${deliveryMethod}</p>
        </div>
        <div style="margin:24px 0;padding:18px;border:1px solid #d8e8c5;border-radius:14px">
          <p style="margin:0 0 8px"><strong>Comprador:</strong> ${customerName}</p>
          <p style="margin:0 0 8px"><strong>Email:</strong> ${escapeHtml(customerEmail || "No informado")}</p>
          <p style="margin:0 0 8px"><strong>Teléfono:</strong> ${escapeHtml(shippingAddress?.phone || "No informado")}</p>
          ${deliveryAddress ? `<p style="margin:0"><strong>Dirección:</strong> ${deliveryAddress}</p>` : ""}
        </div>
        ${orderItemsHtml}
      </div>
    `;

    for (const adminEmail of adminEmails) {
      emails.push({
        to: adminEmail,
        subject: `Nueva venta pagada ${orderCode}`,
        html: adminHtml,
        idempotencyKey: `${event}-admin/${orderId}/${adminEmail}`,
        orderId,
        eventKey: `${event}-admin`,
      });
    }
  }

  await sendEmailsIndependently(emails);
}

export async function sendWithdrawalReceipt(input: {
  requestCode: string;
  email: string;
  orderReference: string;
}) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17210f">
      <p style="font-size:14px;color:#54703a">${escapeHtml(SITE_NAME)}</p>
      <h1>Recibimos tu solicitud</h1>
      <p>Guardá este código como comprobante: <strong>${escapeHtml(input.requestCode)}</strong>.</p>
      <p>Referencia del pedido: ${escapeHtml(input.orderReference)}</p>
      <p>Nos contactaremos usando los datos que informaste.</p>
    </div>
  `;

  await sendEmailsIndependently([
    {
      to: input.email,
      subject: `Solicitud de arrepentimiento ${input.requestCode}`,
      html,
      idempotencyKey: `withdrawal/${input.requestCode}/${input.email}`,
    },
    ...getAdminNotificationRecipients().map((adminEmail) => ({
      to: adminEmail,
      subject: `Nueva solicitud de arrepentimiento ${input.requestCode}`,
      html,
      idempotencyKey: `withdrawal-admin/${input.requestCode}/${adminEmail}`,
    })),
  ]);
}
