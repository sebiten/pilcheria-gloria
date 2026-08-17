"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { z } from "zod";
import { ensureUserProfile, requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PublicProductReview, ProductReviewStats } from "@/types";
import { reportDataFallback } from "@/lib/logging";

type ReviewFormState = {
  ok: boolean;
  message: string;
};

const PRODUCT_REVIEWS_CACHE_TAG = "product-reviews";

const reviewSchema = z.object({
  productId: z.string().uuid(),
  productSlug: z.string().trim().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  comment: z.string().trim().min(10).max(1000),
});

function mapPublicReview(row: any): PublicProductReview {
  return {
    id: row.id,
    rating: Number(row.rating),
    title: row.title,
    comment: row.comment,
    reviewer_name: row.reviewer_name,
    approved: row.approved !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getProductReviewStats(
  productId: string
): Promise<ProductReviewStats> {
  return getProductReviewStatsCached(productId);
}

const getProductReviewStatsCached = unstable_cache(
  async (productId: string): Promise<ProductReviewStats> => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("product_reviews")
      .select("rating")
      .eq("product_id", productId)
      .eq("approved", true);

    if (error) {
      reportDataFallback("review-stats", error);
      return { average: 0, count: 0 };
    }

    const ratings = data || [];
    const count = ratings.length;
    const average = count
      ? ratings.reduce((sum, row) => sum + Number(row.rating), 0) / count
      : 0;

    return {
      average: Number(average.toFixed(1)),
      count,
    };
  },
  ["product-review-stats"],
  {
    tags: [PRODUCT_REVIEWS_CACHE_TAG],
    revalidate: 3600,
  }
);

export async function getProductReviews(
  productId: string
): Promise<PublicProductReview[]> {
  return getProductReviewsCached(productId);
}

const getProductReviewsCached = unstable_cache(
  async (productId: string): Promise<PublicProductReview[]> => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("product_reviews")
      .select(
        "id, rating, title, comment, reviewer_name, approved, created_at, updated_at"
      )
      .eq("product_id", productId)
      .eq("approved", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      reportDataFallback("reviews", error);
      return [];
    }

    return (data || []).map(mapPublicReview);
  },
  ["product-reviews"],
  {
    tags: [PRODUCT_REVIEWS_CACHE_TAG],
    revalidate: 3600,
  }
);

async function getProductReviewEligibilityData(productId: string) {
  const { userId } = await auth();
  if (!userId) {
    return {
      canReview: false,
      reason: "Inicia sesión para dejar una reseña.",
      existingReview: null,
      orderId: null,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: existingReview } = await supabase
    .from("product_reviews")
    .select(
      "id, rating, title, comment, reviewer_name, approved, created_at, updated_at"
    )
    .eq("product_id", productId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, items:order_items!inner(product_id)")
    .eq("clerk_user_id", userId)
    .eq("status", "delivered")
    .eq("items.product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    reportDataFallback("review-eligibility", error);
    return {
      canReview: false,
      reason: "No pudimos validar tu compra.",
      existingReview: existingReview ? mapPublicReview(existingReview) : null,
      orderId: null,
    };
  }

  return {
    canReview: Boolean(orders?.[0]),
    reason: orders?.[0]
      ? null
      : "Podés dejar una reseña cuando el pedido figure como entregado.",
    existingReview: existingReview ? mapPublicReview(existingReview) : null,
    orderId: orders?.[0]?.id ?? null,
  };
}

export async function getProductReviewEligibility(productId: string) {
  const { orderId: _orderId, ...eligibility } =
    await getProductReviewEligibilityData(productId);
  return eligibility;
}

export async function submitProductReview(
  _state: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, message: "Inicia sesión para dejar una reseña." };
  }

  const parsed = reviewSchema.safeParse({
    productId: formData.get("productId"),
    productSlug: formData.get("productSlug"),
    rating: formData.get("rating"),
    title: formData.get("title"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Completa la reseña con datos válidos." };
  }

  const profile = await ensureUserProfile();
  const eligibility = await getProductReviewEligibilityData(
    parsed.data.productId
  );

  if (!eligibility.canReview || !eligibility.orderId) {
    return {
      ok: false,
      message: eligibility.reason || "No puedes opinar sobre este producto.",
    };
  }

  const supabase = getSupabaseAdmin();
  const profileName = profile.full_name?.trim();
  const reviewerName =
    profileName && !profileName.includes("@")
      ? profileName.slice(0, 80)
      : "Cliente verificado";
  const { error } = await supabase.from("product_reviews").upsert(
    {
      product_id: parsed.data.productId,
      clerk_user_id: userId,
      order_id: eligibility.orderId,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      comment: parsed.data.comment,
      reviewer_name: reviewerName,
      approved: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,clerk_user_id" }
  );

  if (error) {
    console.error("Error saving review:", error);
    return { ok: false, message: "No se pudo guardar la reseña." };
  }

  updateTag(PRODUCT_REVIEWS_CACHE_TAG);
  revalidatePath(`/uniformes/${parsed.data.productSlug}`);
  return {
    ok: true,
    message: "Reseña recibida. Se publicará después de revisarla.",
  };
}

export async function getProductReviewsAdmin() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*, product:products(name, slug)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function setProductReviewApproval(
  reviewId: string,
  approved: boolean,
  _formData?: FormData
) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product_reviews")
    .update({ approved, updated_at: new Date().toISOString() })
    .eq("id", reviewId)
    .select("product:products(slug)")
    .single();

  if (error) throw error;
  updateTag(PRODUCT_REVIEWS_CACHE_TAG);
  revalidatePath("/dashboard/reviews");
  const product = Array.isArray(data.product) ? data.product[0] : data.product;
  if (product?.slug) revalidatePath(`/uniformes/${product.slug}`);
}

export async function deleteProductReviewAdmin(
  reviewId: string,
  _formData?: FormData
) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("id", reviewId)
    .select("product:products(slug)")
    .single();

  if (error) throw error;
  updateTag(PRODUCT_REVIEWS_CACHE_TAG);
  revalidatePath("/dashboard/reviews");
  const product = Array.isArray(data.product) ? data.product[0] : data.product;
  if (product?.slug) revalidatePath(`/uniformes/${product.slug}`);
}
