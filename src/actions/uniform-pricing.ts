"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidateProductCacheFromServerAction } from "@/lib/cache/products";
import { UNIFORM_PRICE_GROUPS_CACHE_TAG } from "@/lib/uniform-pricing";

const uniformPricesSchema = z.object({
  remeraPrice: z.number().int().min(1000).max(1_000_000),
  chombaPrice: z.number().int().min(1000).max(1_000_000),
});

export async function updateUniformPrices(input: {
  remeraPrice: number;
  chombaPrice: number;
}) {
  await requireAdmin();
  const prices = uniformPricesSchema.parse(input);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("update_uniform_price_groups", {
    p_remera_price: prices.remeraPrice,
    p_chomba_price: prices.chombaPrice,
  });

  if (error) throw error;

  updateTag(UNIFORM_PRICE_GROUPS_CACHE_TAG);
  revalidateProductCacheFromServerAction();
  revalidatePath("/dashboard/pricing");
}
