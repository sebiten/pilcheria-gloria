"use server";

import { cache } from "react";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/actions/auth";
import { getCategoriesPublic } from "@/actions/categories";
import {
  PRODUCT_DETAILS_CACHE_TAG,
  PRODUCTS_CACHE_TAG,
  revalidateProductCacheFromServerAction,
} from "@/lib/cache/products";
import type { Category, ProductWithDetails } from "@/types";
import { reportDataFallback } from "@/lib/logging";
import {
  mapProductRow,
  PRODUCT_OFFERS_SELECT,
  PRODUCT_PRICE_GROUP_SELECT,
} from "@/lib/inventory";
import {
  getUniformPriceGroup,
  inferUniformPriceGroupCode,
} from "@/lib/uniform-pricing";

const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().trim().optional(),
});

const productVariantSchema = z
  .object({
    size: z.string().trim().min(1),
    sizeSystem: z.enum(["infant", "adult"]).nullable().optional(),
    schoolLevel: z.enum(["primary", "secondary"]).nullable().optional(),
    color: z.string().trim().nullable().optional(),
    sku: z.string().trim().nullable().optional(),
    priceOverride: z.number().nonnegative().nullable().optional(),
    stock: z.number().int().nonnegative().optional(),
    partnerPrice: z.number().positive().nullable().optional(),
    partnerAvailable: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .superRefine((variant, context) => {
    if (variant.partnerAvailable && !variant.partnerPrice) {
      context.addIssue({
        code: "custom",
        path: ["partnerPrice"],
        message: "La disponibilidad en el negocio necesita un precio",
      });
    }
  });

const productPayloadSchema = z
  .object({
    name: z.string().trim().min(2),
    slug: z.string().trim().min(2),
    description: z.string().trim().max(4000).optional(),
    basePrice: z.number().positive(),
    compareAtPrice: z.number().positive().nullable().optional(),
    brand: z.string().trim().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional(),
    images: z.array(productImageSchema).max(10).default([]),
    variants: z.array(productVariantSchema).max(100).default([]),
  })
  .superRefine((product, context) => {
    if (product.active === false) return;

    if (!product.description || product.description.trim().length < 20) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "Un producto activo necesita una descripción completa",
      });
    }
    if (product.images.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["images"],
        message: "Un producto activo necesita al menos una imagen",
      });
    }
    if (!product.variants.some((variant) => variant.active !== false)) {
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Un producto activo necesita al menos una variante",
      });
    }
  });

type ProductPayload = z.infer<typeof productPayloadSchema>;

async function resolveUniformProductPricing(payload: ProductPayload) {
  const uniformPriceGroupCode = inferUniformPriceGroupCode(payload.name);
  if (!uniformPriceGroupCode) {
    return { payload, uniformPriceGroupCode: null };
  }

  const group = await getUniformPriceGroup(uniformPriceGroupCode);
  if (!group) {
    throw new Error("Falta configurar el precio general de este uniforme");
  }

  return {
    uniformPriceGroupCode,
    payload: {
      ...payload,
      basePrice: group.price,
      variants: payload.variants.map((variant) => ({
        ...variant,
        priceOverride: group.price,
      })),
    },
  };
}

type ProductMutationResult =
  | { ok: true }
  | { ok: false; error: string };

function getProductMutationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return Array.from(new Set(error.issues.map((issue) => issue.message))).join(
      ". "
    );
  }

  if (error && typeof error === "object" && "code" in error) {
    const databaseError = error as {
      code?: string;
      message?: string;
      constraint?: string;
    };
    const details = `${databaseError.constraint ?? ""} ${databaseError.message ?? ""}`;

    if (databaseError.code === "23505") {
      if (details.includes("sku")) {
        return "Ese SKU ya está asignado a otra variante";
      }
      if (details.includes("product_variants")) {
        return "Ya existe una variante con ese talle y color";
      }
      return "Ya existe otro producto con ese nombre o dirección web";
    }
  }

  return "No se pudo guardar el producto. Revisá los datos e intentá nuevamente";
}

const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_SIZE = 4 * 1024 * 1024;

async function hasWebpSignature(file: File) {
  if (file.size < 12) return false;

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function normalizeProductVariants(variants: ProductPayload["variants"]) {
  const variantsBySize = new Map<string, ProductPayload["variants"][number]>();

  for (const variant of variants) {
    const size = variant.size.trim();
    const color = variant.color?.trim() || null;
    const sku = variant.sku?.trim() || null;
    const key = `${variant.schoolLevel ?? "no-design"}:${variant.sizeSystem ?? "legacy"}:${size.toLocaleLowerCase("es-AR")}:${color?.toLocaleLowerCase("es-AR") ?? ""}`;
    const existing = variantsBySize.get(key);

    if (!existing) {
      variantsBySize.set(key, { ...variant, size, color, sku });
      continue;
    }

    variantsBySize.set(key, {
      ...existing,
      sku: existing.sku || sku,
      priceOverride: existing.priceOverride ?? variant.priceOverride ?? null,
      stock: Number(existing.stock ?? 0) + Number(variant.stock ?? 0),
      active: Boolean(existing.active ?? true) || Boolean(variant.active ?? true),
    });
  }

  return Array.from(variantsBySize.values()).sort((a, b) =>
    `${a.size}-${a.color ?? ""}`.localeCompare(
      `${b.size}-${b.color ?? ""}`,
      "es",
      { numeric: true, sensitivity: "base" }
    )
  );
}

function getAvailableSizeCount(product: ProductWithDetails) {
  return new Set(
    product.variants
      .filter(
        (variant) =>
          variant.active !== false && variant.available
      )
      .map(
        (variant) =>
          `${variant.schoolLevel ?? "no-design"}:${variant.sizeSystem ?? "legacy"}:${variant.size.trim().toLocaleLowerCase("es-AR")}`
      )
      .filter(Boolean)
  ).size;
}

function getAvailableStock(product: ProductWithDetails) {
  return product.variants.reduce(
    (stock, variant) =>
      variant.active !== false && variant.available
        ? stock + Math.max(1, Number(variant.stock ?? 0))
        : stock,
    0
  );
}

function sortProductsByAvailableSizes(products: ProductWithDetails[]) {
  return products.sort((first, second) => {
    const sizeDifference =
      getAvailableSizeCount(second) - getAvailableSizeCount(first);

    if (sizeDifference !== 0) return sizeDifference;

    const stockDifference =
      getAvailableStock(second) - getAvailableStock(first);

    return stockDifference !== 0
      ? stockDifference
      : first.name.localeCompare(second.name, "es", {
          sensitivity: "base",
        });
  });
}

async function fetchProduct(query: any) {
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapProductRow(data);
}

async function replaceProductRelations(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  payload: ProductPayload
) {
  const [
    { data: previousImages, error: previousImagesError },
    { data: previousVariants, error: previousVariantsError },
  ] = await Promise.all([
    supabase.from("product_images").select("*").eq("product_id", productId),
    supabase.from("product_variants").select("*").eq("product_id", productId),
  ]);
  if (previousImagesError) throw previousImagesError;
  if (previousVariantsError) throw previousVariantsError;

  const previousVariantIds = (previousVariants || []).map(
    (variant) => variant.id
  );
  const previousOffersResult = previousVariantIds.length
    ? await supabase
        .from("variant_offers")
        .select("*")
        .in("variant_id", previousVariantIds)
    : { data: [], error: null };
  if (previousOffersResult.error) throw previousOffersResult.error;
  const previousOffers = previousOffersResult.data || [];

  const { data: sources, error: sourcesError } = await supabase
    .from("inventory_sources")
    .select("id, code, priority")
    .in("code", ["own", "grandma_store"]);
  if (sourcesError) throw sourcesError;

  const ownSource = sources?.find((source) => source.code === "own");
  const partnerSource = sources?.find(
    (source) => source.code === "grandma_store"
  );
  if (!ownSource || !partnerSource) {
    throw new Error("Faltan los orígenes de inventario configurados");
  }

  const imageByUrl = new Map(
    (previousImages || []).map((image) => [image.url, image])
  );
  const desiredImages = payload.images.map((image, index) => ({
    id: imageByUrl.get(image.url)?.id ?? randomUUID(),
    product_id: productId,
    url: image.url,
    alt: image.alt || null,
    sort_order: index,
  }));
  const variants = normalizeProductVariants(payload.variants);
  const variantByKey = new Map(
    (previousVariants || []).map((variant) => [
      `${variant.school_level ?? "no-design"}:${variant.size_system ?? "legacy"}:${variant.size?.trim().toLocaleLowerCase("es-AR") ?? ""}:${
        variant.color?.trim().toLocaleLowerCase("es-AR") ?? ""
      }`,
      variant,
    ])
  );
  const desiredVariantEntries = variants.map((variant) => {
    const key = `${variant.schoolLevel ?? "no-design"}:${variant.sizeSystem ?? "legacy"}:${variant.size.toLocaleLowerCase("es-AR")}:${
      variant.color?.toLocaleLowerCase("es-AR") ?? ""
    }`;
    return {
      variant,
      row: {
      id: variantByKey.get(key)?.id ?? randomUUID(),
      product_id: productId,
      size: variant.size,
      size_system: variant.sizeSystem ?? null,
      school_level: variant.schoolLevel ?? null,
      color: variant.color ?? null,
      sku: variant.sku ?? null,
      price_override: variant.priceOverride ?? null,
      stock: variant.stock ?? 0,
      active: variant.active ?? true,
      },
    };
  });
  const desiredVariants = desiredVariantEntries.map((entry) => entry.row);

  const previousOfferByKey = new Map(
    previousOffers.map((offer) => [
      `${offer.variant_id}:${offer.source_id}`,
      offer,
    ])
  );
  const desiredOffers = desiredVariantEntries.flatMap(({ variant, row }) => {
    const ownExisting = previousOfferByKey.get(
      `${row.id}:${ownSource.id}`
    );
    const offers: Array<Record<string, unknown>> = [
      {
        id: ownExisting?.id ?? randomUUID(),
        variant_id: row.id,
        source_id: ownSource.id,
        availability_mode: "finite",
        sale_price: variant.priceOverride ?? payload.basePrice,
        stock_quantity: variant.stock ?? 0,
        priority: ownSource.priority,
        lead_time_min_hours: 0,
        lead_time_max_hours: 0,
        active: true,
        updated_at: new Date().toISOString(),
      },
    ];

    if (variant.partnerAvailable && variant.partnerPrice) {
      const partnerExisting = previousOfferByKey.get(
        `${row.id}:${partnerSource.id}`
      );
      offers.push({
        id: partnerExisting?.id ?? randomUUID(),
        variant_id: row.id,
        source_id: partnerSource.id,
        availability_mode: "on_demand",
        sale_price: variant.partnerPrice,
        stock_quantity: null,
        priority: partnerSource.priority,
        lead_time_min_hours: 24,
        lead_time_max_hours: 48,
        active: true,
        updated_at: new Date().toISOString(),
      });
    }

    return offers;
  });
  const desiredImageIds = new Set(desiredImages.map((image) => image.id));
  const desiredVariantIds = new Set(
    desiredVariants.map((variant) => variant.id)
  );
  const desiredOfferIds = new Set(desiredOffers.map((offer) => offer.id));
  const staleImages = (previousImages || []).filter(
    (image) => !desiredImageIds.has(image.id)
  );
  const staleVariants = (previousVariants || []).filter(
    (variant) => !desiredVariantIds.has(variant.id)
  );

  try {
    if (desiredImages.length > 0) {
      const { error } = await supabase
        .from("product_images")
        .upsert(desiredImages, { onConflict: "id" });
      if (error) throw error;
    }
    if (desiredVariants.length > 0) {
      const { error } = await supabase
        .from("product_variants")
        .upsert(desiredVariants, { onConflict: "id" });
      if (error) throw error;
    }
    if (desiredOffers.length > 0) {
      const { error } = await supabase
        .from("variant_offers")
        .upsert(desiredOffers, { onConflict: "id" });
      if (error) throw error;
    }
    const staleOfferIds = previousOffers
      .filter((offer) => !desiredOfferIds.has(offer.id))
      .map((offer) => offer.id);
    if (staleOfferIds.length > 0) {
      const { error } = await supabase
        .from("variant_offers")
        .update({ active: false })
        .in("id", staleOfferIds);
      if (error) throw error;
    }
    if (staleImages.length > 0) {
      const { error } = await supabase
        .from("product_images")
        .delete()
        .in(
          "id",
          staleImages.map((image) => image.id)
        );
      if (error) throw error;
    }
    if (staleVariants.length > 0) {
      const staleIds = staleVariants.map((variant) => variant.id);
      const { error } = await supabase
        .from("product_variants")
        .delete()
        .in("id", staleIds);

      if (error?.code === "23503") {
        const { error: archiveError } = await supabase
          .from("product_variants")
          .update({ active: false, stock: 0 })
          .in("id", staleIds);
        if (archiveError) throw archiveError;
      } else if (error) {
        throw error;
      }
    }
  } catch (error) {
    const previousImageIds = new Set(
      (previousImages || []).map((image) => image.id)
    );
    const previousVariantIdSet = new Set(
      (previousVariants || []).map((variant) => variant.id)
    );
    const previousOfferIds = new Set(previousOffers.map((offer) => offer.id));
    const newImageIds = desiredImages
      .filter((image) => !previousImageIds.has(image.id))
      .map((image) => image.id);
    const newVariantIds = desiredVariants
      .filter((variant) => !previousVariantIdSet.has(variant.id))
      .map((variant) => variant.id);
    const newOfferIds = desiredOffers
      .filter((offer) => !previousOfferIds.has(offer.id))
      .map((offer) => offer.id);

    if (newOfferIds.length > 0) {
      await supabase.from("variant_offers").delete().in("id", newOfferIds);
    }
    if (newImageIds.length > 0) {
      await supabase.from("product_images").delete().in("id", newImageIds);
    }
    if (newVariantIds.length > 0) {
      await supabase.from("product_variants").delete().in("id", newVariantIds);
    }
    if ((previousImages || []).length > 0) {
      await supabase
        .from("product_images")
        .upsert(previousImages || [], { onConflict: "id" });
    }
    if ((previousVariants || []).length > 0) {
      await supabase
        .from("product_variants")
        .upsert(previousVariants || [], { onConflict: "id" });
    }
    if (previousOffers.length > 0) {
      await supabase
        .from("variant_offers")
        .upsert(previousOffers, { onConflict: "id" });
    }
    throw error;
  }

  return staleImages.map((image) => image.url);
}

function getProductImageStoragePath(url: string) {
  try {
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function removeUnreferencedProductImages(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  urls: string[]
) {
  const paths: string[] = [];

  for (const url of urls) {
    const path = getProductImageStoragePath(url);
    if (!path) continue;

    const { count, error } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("url", url);
    if (!error && count === 0) paths.push(path);
  }

  if (paths.length > 0) {
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove(paths);
    if (error) {
      console.error("No se pudieron limpiar imágenes sin referencia:", error);
    }
  }
}

type ProductQueryOptions = {
  categorySlug?: string;
  brand?: string;
  searchTerm?: string;
  featured?: boolean;
  limit?: number;
};

export async function getProducts(
  options?: ProductQueryOptions
): Promise<ProductWithDetails[]> {
  try {
    const normalizedOptions = {
      categorySlug: options?.categorySlug,
      brand: options?.brand?.trim() || undefined,
      searchTerm: options?.searchTerm?.trim().slice(0, 80) || undefined,
      featured: options?.featured,
      limit: options?.limit,
    };

    return normalizedOptions.searchTerm
      ? await fetchProducts(normalizedOptions)
      : await getProductsCached(normalizedOptions);
  } catch (error) {
    reportDataFallback("products", error);
    return [];
  }
}

async function fetchProducts(
  options?: ProductQueryOptions
): Promise<ProductWithDetails[]> {
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("products")
      .select(`
        *,
        ${PRODUCT_PRICE_GROUP_SELECT},
        category:categories(*),
        images:product_images(*),
        variants:product_variants(${PRODUCT_OFFERS_SELECT})
      `)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (options?.categorySlug) {
      const { data: selectedCategory, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", options.categorySlug)
        .eq("active", true)
        .maybeSingle();

      if (categoryError) throw categoryError;
      if (!selectedCategory) return [];

      const { data: childCategories, error: childCategoriesError } =
        await supabase
          .from("categories")
          .select("id")
          .eq("parent_id", selectedCategory.id)
          .eq("active", true);

      if (childCategoriesError) throw childCategoriesError;
      query = query.in("category_id", [
        selectedCategory.id,
        ...(childCategories || []).map((category) => category.id),
      ]);
    }

    if (options?.brand) {
      query = query.ilike("brand", options.brand);
    }

    if (options?.searchTerm) {
      const searchTerm = options.searchTerm.replace(/[,%()]/g, " ").trim();
      if (searchTerm) {
        query = query.or(
          `name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`
        );
      }
    }

    if (options?.featured) {
      query = query.eq("featured", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const products = sortProductsByAvailableSizes(
      (data || []).map(mapProductRow)
    );

  return options?.limit ? products.slice(0, options.limit) : products;
}

const getProductsCached = unstable_cache(
  fetchProducts,
  ["products-public-v9"],
  {
    tags: [PRODUCTS_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function getBrands(): Promise<string[]> {
  try {
    return await getBrandsCached();
  } catch (error) {
    reportDataFallback("brands", error);
    return [];
  }
}

const getBrandsCached = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("products")
      .select("brand")
      .eq("active", true)
      .not("brand", "is", null)
      .order("brand", { ascending: true });

    if (error) throw error;

    return Array.from(
      new Set(
        (data || [])
          .map((row) => row.brand?.trim())
          .filter((brand): brand is string => Boolean(brand))
      )
    );
  },
  ["product-brands-v2"],
  {
    tags: [PRODUCTS_CACHE_TAG],
    revalidate: 3600,
  }
);

export const getProductBySlug = cache(async function getProductBySlug(
  slug: string
): Promise<ProductWithDetails | null> {
  try {
    return await getProductBySlugCached(slug);
  } catch (error) {
    reportDataFallback("product", error);
    return null;
  }
});

const getProductBySlugCached = unstable_cache(
  async (slug: string): Promise<ProductWithDetails | null> => {
    const supabase = getSupabaseAdmin();

    return fetchProduct(
      supabase
        .from("products")
        .select(`
          *,
          ${PRODUCT_PRICE_GROUP_SELECT},
          category:categories(*),
          images:product_images(*),
          variants:product_variants(${PRODUCT_OFFERS_SELECT})
        `)
        .eq("slug", slug)
        .eq("active", true)
    );
  },
  ["product-by-slug-v8"],
  {
    tags: [PRODUCT_DETAILS_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function getProductByIdAdmin(id: string): Promise<ProductWithDetails | null> {
  await requireAdmin();
  const supabase = getSupabaseAdmin();

  return fetchProduct(
    supabase
      .from("products")
      .select(`
        *,
        ${PRODUCT_PRICE_GROUP_SELECT},
        category:categories(*),
        images:product_images(*),
        variants:product_variants(${PRODUCT_OFFERS_SELECT})
      `)
      .eq("id", id)
  );
}

export async function getCategories(): Promise<Category[]> {
  return getCategoriesPublic();
}

export async function createProduct(input: ProductPayload) {
  await requireAdmin();
  const parsedPayload = productPayloadSchema.parse(input);
  const { payload, uniformPriceGroupCode } = await resolveUniformProductPricing(
    parsedPayload
  );
  const supabase = getSupabaseAdmin();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name: payload.name,
      slug: payload.slug,
      description: payload.description || null,
      base_price: payload.basePrice,
      compare_at_price: payload.compareAtPrice ?? null,
      brand: payload.brand || null,
      category_id: payload.categoryId || null,
      uniform_price_group_code: uniformPriceGroupCode,
      featured: payload.featured || false,
      active: payload.active ?? true,
    })
    .select("id, slug")
    .single();

  if (error || !product) {
    throw error ?? new Error("No se pudo crear el producto");
  }

  try {
    await replaceProductRelations(supabase, product.id, payload);
  } catch (relationError) {
    await supabase.from("products").delete().eq("id", product.id);
    await removeUnreferencedProductImages(
      supabase,
      payload.images.map((image) => image.url)
    );
    throw relationError;
  }
  revalidateProductCacheFromServerAction(product.slug);

  return product;
}

export async function saveProduct(
  input: ProductPayload,
  productId?: string
): Promise<ProductMutationResult> {
  try {
    if (productId) {
      await updateProduct(productId, input);
    } else {
      await createProduct(input);
    }

    return { ok: true };
  } catch (error) {
    console.error("Error al guardar el producto:", error);
    return { ok: false, error: getProductMutationError(error) };
  }
}

export async function uploadProductImage(formData: FormData) {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Archivo invalido");
  }

  if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
    throw new Error("La imagen no puede superar 4MB");
  }

  if (file.type !== "image/webp" || !(await hasWebpSignature(file))) {
    throw new Error("La imagen debe estar convertida a WebP");
  }

  const supabase = getSupabaseAdmin();
  const path = `products/${randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);

  return {
    path,
    url: data.publicUrl,
  };
}

export async function updateProduct(id: string, input: ProductPayload) {
  await requireAdmin();
  const parsedPayload = productPayloadSchema.parse(input);
  const { payload, uniformPriceGroupCode } = await resolveUniformProductPricing(
    parsedPayload
  );
  const supabase = getSupabaseAdmin();

  const existing = await getProductByIdAdmin(id);
  if (!existing) {
    throw new Error("Producto no encontrado");
  }

  const { error } = await supabase
    .from("products")
    .update({
      name: payload.name,
      slug: payload.slug,
      description: payload.description || null,
      base_price: payload.basePrice,
      compare_at_price: payload.compareAtPrice ?? null,
      brand: payload.brand || null,
      category_id: payload.categoryId || null,
      uniform_price_group_code: uniformPriceGroupCode,
      featured: payload.featured || false,
      active: payload.active ?? true,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }

  let removedImageUrls: string[];
  try {
    removedImageUrls = await replaceProductRelations(supabase, id, payload);
  } catch (relationError) {
    await supabase
      .from("products")
      .update({
        name: existing.name,
        slug: existing.slug,
        description: existing.description || null,
        base_price: existing.basePrice,
        compare_at_price: existing.compareAtPrice,
        brand: existing.brand,
        category_id: existing.categoryId,
        uniform_price_group_code: existing.uniformPriceGroup?.code ?? null,
        featured: existing.featured,
        active: existing.active,
      })
      .eq("id", id);
    throw relationError;
  }

  await removeUnreferencedProductImages(supabase, removedImageUrls);
  revalidateProductCacheFromServerAction(existing.slug);
  revalidateProductCacheFromServerAction(payload.slug);
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const existing = await getProductByIdAdmin(id);

  if (!existing) {
    throw new Error("Producto no encontrado");
  }

  const imageUrls = existing.images.map((image) => image.url);
  const { count: orderItemCount, error: orderItemCountError } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  if (orderItemCountError) throw orderItemCountError;

  const productMutation =
    (orderItemCount ?? 0) > 0
      ? supabase.from("products").update({ active: false }).eq("id", id)
      : supabase.from("products").delete().eq("id", id);
  const { error } = await productMutation;
  if (error) {
    throw error;
  }

  if ((orderItemCount ?? 0) === 0) {
    await removeUnreferencedProductImages(supabase, imageUrls);
  }
  revalidateProductCacheFromServerAction(existing.slug);
}

export async function renameProductBrand(
  currentBrand: string,
  formData: FormData
) {
  await requireAdmin();
  const nextBrand = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .parse(formData.get("brand"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("products")
    .update({ brand: nextBrand })
    .ilike("brand", currentBrand);

  if (error) throw error;
  revalidateProductCacheFromServerAction();
}
