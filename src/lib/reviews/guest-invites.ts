import "server-only";

import { createHash, createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/site";

const REVIEW_INVITE_DAYS = 90;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createGuestReviewLinks(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      guest_access_token,
      guest_access_token_hash,
      items:order_items(
        product_id,
        product_name,
        product:products(name)
      )
    `)
    .eq("id", orderId)
    .single();

  const guestSecret = order?.guest_access_token_hash || order?.guest_access_token;
  if (error || !order || order.status !== "delivered" || !guestSecret) {
    return [];
  }

  const uniqueProducts = new Map<string, string>();
  for (const item of order.items ?? []) {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    const productName = item.product_name || product?.name;
    if (item.product_id && productName) {
      uniqueProducts.set(item.product_id, productName);
    }
  }

  const expiresAt = new Date(
    Date.now() + REVIEW_INVITE_DAYS * 24 * 60 * 60 * 1_000
  ).toISOString();
  const links: Array<{ productName: string; url: string }> = [];

  for (const [productId, productName] of uniqueProducts) {
    const token = createHmac("sha256", guestSecret)
      .update(`review:${order.id}:${productId}`)
      .digest("base64url");
    const { error: inviteError } = await supabase
      .from("product_review_invites")
      .upsert(
        {
          order_id: order.id,
          product_id: productId,
          token_hash: hashToken(token),
          expires_at: expiresAt,
        },
        { onConflict: "order_id,product_id" }
      );

    if (inviteError) {
      console.error("No se pudo crear la invitación de reseña:", inviteError);
      continue;
    }

    links.push({
      productName,
      url: absoluteUrl(`/review/${token}`),
    });
  }

  return links;
}

export function getGuestReviewTokenHash(token: string) {
  return hashToken(token);
}
