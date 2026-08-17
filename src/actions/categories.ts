"use server";

import { z } from "zod";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/actions/auth";
import type { Category } from "@/types";
import { reportDataFallback } from "@/lib/logging";

const categoryPayloadSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

type CategoryPayload = z.infer<typeof categoryPayloadSchema>;

export interface CategoryWithCount extends Category {
  productCount: number;
}

const CATEGORIES_CACHE_TAG = "categories";
const LEGACY_CATEGORY_SLUGS = new Set([
  "colchones",
  "sommiers",
  "almohadas",
  "accesorios",
]);

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

function revalidateCategoryPaths() {
  updateTag(CATEGORIES_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/uniformes");
  revalidatePath("/dashboard/categories");
}

export async function getCategoriesPublic(): Promise<Category[]> {
  try {
    return await getCategoriesPublicCached();
  } catch (error) {
    reportDataFallback("categories", error);
    return [];
  }
}

const getCategoriesPublicCached = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return (data || []) as Category[];
  },
  ["categories-public-v2"],
  {
    tags: [CATEGORIES_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function getCategoriesAdmin(): Promise<CategoryWithCount[]> {
  await requireAdmin();
  const supabase = getSupabaseAdmin();

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("products").select("category_id"),
    ]);

  if (categoriesError) {
    throw new Error(
      getErrorMessage(categoriesError, "No se pudieron cargar las categorías")
    );
  }

  if (productsError) {
    reportDataFallback("category-product-counts", productsError);
  }

  const counts = new Map<string, number>();
  for (const product of products || []) {
    if (!product.category_id) continue;
    counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1);
  }

  return ((categories || []) as Category[])
    .filter((category) => !LEGACY_CATEGORY_SLUGS.has(category.slug))
    .map((category) => ({
      ...category,
      productCount: counts.get(category.id) || 0,
    }));
}

export async function createCategory(input: CategoryPayload) {
  await requireAdmin();
  const payload = categoryPayloadSchema.parse(input);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: payload.name,
      slug: payload.slug,
      description: payload.description || null,
      image_url: payload.imageUrl || null,
      parent_id: payload.parentId || null,
      sort_order: payload.sortOrder ?? 0,
      active: payload.active ?? true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  revalidateCategoryPaths();
  return data;
}

export async function updateCategory(id: string, input: CategoryPayload) {
  await requireAdmin();
  const payload = categoryPayloadSchema.parse(input);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("categories")
    .update({
      name: payload.name,
      slug: payload.slug,
      description: payload.description || null,
      image_url: payload.imageUrl || null,
      parent_id: payload.parentId || null,
      sort_order: payload.sortOrder ?? 0,
      active: payload.active ?? true,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }

  revalidateCategoryPaths();
}

export async function deleteCategory(id: string) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();

  const { count, error: countError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("category_id", id);

  if (countError) {
    throw countError;
  }

  if ((count || 0) > 0) {
    throw new Error("No se puede eliminar una categoría con productos asociados");
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) {
    throw error;
  }

  revalidateCategoryPaths();
}
