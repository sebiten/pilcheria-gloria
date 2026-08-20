import "server-only";

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  UniformPriceGroup,
  UniformPriceGroupCode,
} from "@/types";

export const UNIFORM_PRICE_GROUPS_CACHE_TAG = "uniform-price-groups";

export function inferUniformPriceGroupCode(
  productName: string
): UniformPriceGroupCode | null {
  const normalizedName = productName.trim().toLocaleLowerCase("es-AR");
  if (normalizedName.startsWith("remera ")) return "remera";
  if (normalizedName.startsWith("chomba ")) return "chomba";
  return null;
}

async function fetchUniformPriceGroups(): Promise<UniformPriceGroup[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("uniform_price_groups")
    .select("code, name, price, updated_at")
    .in("code", ["remera", "chomba"])
    .order("code", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((group) => ({
    code: group.code as UniformPriceGroupCode,
    name: group.name,
    price: Number(group.price),
    updatedAt: group.updated_at,
  }));
}

export const getUniformPriceGroups = unstable_cache(
  fetchUniformPriceGroups,
  ["uniform-price-groups-v1"],
  {
    tags: [UNIFORM_PRICE_GROUPS_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function getUniformPriceGroup(
  code: UniformPriceGroupCode
) {
  const groups = await getUniformPriceGroups();
  return groups.find((group) => group.code === code) ?? null;
}
