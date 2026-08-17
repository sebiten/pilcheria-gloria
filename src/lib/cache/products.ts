import { revalidatePath, revalidateTag, updateTag } from "next/cache";

export const PRODUCTS_CACHE_TAG = "products";
export const PRODUCT_DETAILS_CACHE_TAG = "product-details";

function revalidateProductPaths(slug?: string) {
  revalidatePath("/");
  revalidatePath("/uniformes");
  revalidatePath("/dashboard/products");

  if (slug) {
    revalidatePath(`/uniformes/${slug}`);
  } else {
    revalidatePath("/uniformes/[slug]", "page");
  }
}

export function revalidateProductCacheFromServerAction(slug?: string) {
  updateTag(PRODUCTS_CACHE_TAG);
  updateTag(PRODUCT_DETAILS_CACHE_TAG);
  revalidateProductPaths(slug);
}

export function revalidateProductCacheFromRouteHandler(slug?: string) {
  revalidateTag(PRODUCTS_CACHE_TAG, { expire: 0 });
  revalidateTag(PRODUCT_DETAILS_CACHE_TAG, { expire: 0 });
  revalidateProductPaths(slug);
}
