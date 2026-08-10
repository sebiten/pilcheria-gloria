"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { ensureUserProfile } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CartItem, ProductWithDetails } from "@/types";
import {
  mapProductRow,
  PRODUCT_OFFERS_SELECT,
  sanitizeStorefrontProduct,
} from "@/lib/inventory";

const cartItemInputSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable(),
  quantity: z.number().int().min(1).max(10),
});
const cartItemsInputSchema = z.array(cartItemInputSchema).max(20);

type CartItemInput = z.infer<typeof cartItemInputSchema>;

type CartRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  product?: any;
};

function createCartKey(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? "default"}`;
}

function mapProduct(product: any): ProductWithDetails {
  return sanitizeStorefrontProduct(mapProductRow(product));
}

function mapCartItem(row: CartRow): CartItem {
  return {
    id: row.id,
    product_id: row.product_id,
    variant_id: row.variant_id,
    quantity: row.quantity,
    product: row.product ? mapProduct(row.product) : undefined,
  };
}

function normalizeCartItems(items: CartItemInput[]): CartItemInput[] {
  const merged = new Map<string, CartItemInput>();

  for (const parsed of cartItemsInputSchema.parse(items)) {
    const key = createCartKey(parsed.product_id, parsed.variant_id);
    const existing = merged.get(key);

    if (existing) {
      const quantity = existing.quantity + parsed.quantity;
      if (quantity > 10) {
        throw new Error("La cantidad máxima por talle es 10");
      }
      existing.quantity = quantity;
      continue;
    }

    merged.set(key, { ...parsed });
  }

  return Array.from(merged.values());
}

async function selectUserCart(userId: string): Promise<CartItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cart_items")
    .select(`
      id,
      product_id,
      variant_id,
      quantity,
      product:products(
        *,
        category:categories(*),
        images:product_images(*),
        variants:product_variants(${PRODUCT_OFFERS_SELECT})
      )
    `)
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapCartItem(row as CartRow));
}

async function replaceUserCart(userId: string, items: CartItemInput[]) {
  const supabase = getSupabaseAdmin();
  const normalizedItems = normalizeCartItems(items);

  const { error: deleteError } = await supabase
    .from("cart_items")
    .delete()
    .eq("clerk_user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (normalizedItems.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("cart_items").insert(
    normalizedItems.map((item) => ({
      clerk_user_id: userId,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
    }))
  );

  if (insertError) {
    throw insertError;
  }
}

function mergeCartCollections(remoteItems: CartItem[], localItems: CartItemInput[]) {
  const merged = new Map<string, CartItemInput>();

  for (const item of remoteItems) {
    merged.set(createCartKey(item.product_id, item.variant_id), {
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      quantity: item.quantity,
    });
  }

  for (const item of normalizeCartItems(localItems)) {
    const key = createCartKey(item.product_id, item.variant_id);

    if (merged.has(key)) {
      continue;
    }

    merged.set(key, { ...item });
  }

  return Array.from(merged.values());
}

function revalidateCartPaths() {
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function addToCart(
  productId: string,
  variantId: string | null,
  quantity: number
) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();

  const input = cartItemInputSchema.parse({
    product_id: productId,
    variant_id: variantId ?? null,
    quantity,
  });
  const existingItems = await selectUserCart(userId);
  const existingItem = existingItems.find(
    (item) =>
      item.product_id === input.product_id &&
      (item.variant_id ?? null) === input.variant_id
  );

  await replaceUserCart(userId, [
    ...existingItems
      .filter((item) => item.id !== existingItem?.id)
      .map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        quantity: item.quantity,
      })),
    {
      product_id: input.product_id,
      variant_id: input.variant_id,
      quantity: (existingItem?.quantity || 0) + input.quantity,
    },
  ]);

  revalidateCartPaths();
}

export async function removeFromCart(cartItemId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("clerk_user_id", userId);

  if (error) throw error;
  revalidateCartPaths();
}

export async function getCartItems(): Promise<CartItem[]> {
  const { userId } = await auth();
  if (!userId) return [];

  await ensureUserProfile();
  return selectUserCart(userId);
}

export async function refreshCheckoutCart(
  items: CartItemInput[]
): Promise<CartItem[]> {
  const parsedItems = z.array(cartItemInputSchema).min(1).max(20).parse(items);
  const normalizedItems = normalizeCartItems(parsedItems);
  const supabase = getSupabaseAdmin();
  const productIds = Array.from(
    new Set(normalizedItems.map((item) => item.product_id))
  );
  const { data: products, error } = await supabase
    .from("products")
    .select(`
      *,
      category:categories(*),
      images:product_images(*),
      variants:product_variants(${PRODUCT_OFFERS_SELECT})
    `)
    .in("id", productIds)
    .eq("active", true);

  if (error) throw error;
  const productsById = new Map(
    (products ?? []).map((product) => [product.id, mapProduct(product)])
  );

  return normalizedItems.map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    product: productsById.get(item.product_id),
  }));
}

export async function updateCartItemQuantity(cartItemId: string, quantity: number) {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const supabase = getSupabaseAdmin();

  if (quantity <= 0) {
    return removeFromCart(cartItemId);
  }

  const { error } = await supabase
    .from("cart_items")
    .update({ quantity })
    .eq("id", cartItemId)
    .eq("clerk_user_id", userId);

  if (error) throw error;
  revalidateCartPaths();
}

export async function mergeCartItems(items: CartItemInput[]): Promise<CartItem[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const remoteItems = await selectUserCart(userId);
  const mergedItems = mergeCartCollections(remoteItems, items);

  await replaceUserCart(userId, mergedItems);
  revalidateCartPaths();

  return selectUserCart(userId);
}

export async function replaceCartItems(
  items: CartItemInput[]
): Promise<{ ok: true }> {
  const { userId } = await auth();
  if (!userId) throw new Error("User not authenticated");

  await ensureUserProfile();
  const normalizedItems = normalizeCartItems(items);

  await replaceUserCart(userId, normalizedItems);

  return { ok: true };
}
