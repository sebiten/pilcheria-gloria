import type {
  PricingTier,
  ProductVariant,
  ProductWithDetails,
  SizeSystem,
} from "@/types";

export const PRODUCT_OFFERS_SELECT = `
  *,
  offers:variant_offers(
    id,
    variant_id,
    source_id,
    availability_mode,
    sale_price,
    stock_quantity,
    priority,
    lead_time_min_hours,
    lead_time_max_hours,
    active,
    source:inventory_sources(
      id,
      code,
      name,
      source_type,
      seller_share_rate,
      priority,
      active
    )
  )
`;

type RawOffer = {
  id: string;
  variant_id: string;
  source_id: string;
  availability_mode: "finite" | "on_demand";
  sale_price: number | string;
  stock_quantity: number | null;
  priority: number;
  lead_time_min_hours: number;
  lead_time_max_hours: number;
  active: boolean;
  source?: {
    id: string;
    code: string;
    name: string;
    source_type: "own" | "partner";
    seller_share_rate: number | string;
    priority: number;
    active: boolean;
  } | null;
};

export type RawVariantWithOffers = {
  id: string;
  product_id: string;
  size?: string | null;
  size_system?: SizeSystem | null;
  color?: string | null;
  sku?: string | null;
  price_override?: number | string | null;
  stock?: number | null;
  active?: boolean | null;
  offers?: RawOffer[] | null;
};

export type CheckoutOffer = {
  id: string;
  variantId: string;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  availabilityMode: "finite" | "on_demand";
  salePrice: number;
  stockQuantity: number | null;
  sellerShareRate: number;
  priority: number;
  leadTimeMinHours: number;
  leadTimeMaxHours: number;
};

function getActiveOffers(variant: RawVariantWithOffers): CheckoutOffer[] {
  return (variant.offers ?? [])
    .filter((offer) => offer.active !== false && offer.source?.active !== false)
    .map((offer) => ({
      id: offer.id,
      variantId: offer.variant_id,
      sourceId: offer.source_id,
      sourceCode: offer.source?.code ?? "unknown",
      sourceName: offer.source?.name ?? "Origen no disponible",
      availabilityMode: offer.availability_mode,
      salePrice: Number(offer.sale_price),
      stockQuantity:
        offer.availability_mode === "finite"
          ? Number(offer.stock_quantity ?? 0)
          : null,
      sellerShareRate: Number(offer.source?.seller_share_rate ?? 1),
      priority: Number(offer.priority ?? offer.source?.priority ?? 100),
      leadTimeMinHours: Number(offer.lead_time_min_hours ?? 0),
      leadTimeMaxHours: Number(offer.lead_time_max_hours ?? 0),
    }))
    .filter(
      (offer) =>
        Number.isFinite(offer.salePrice) &&
        offer.salePrice > 0 &&
        (offer.availabilityMode === "on_demand" ||
          Number(offer.stockQuantity) > 0)
    )
    .sort(
      (first, second) =>
        first.priority - second.priority || first.id.localeCompare(second.id)
    );
}

export function getCheckoutOffers(variant: RawVariantWithOffers) {
  return getActiveOffers(variant);
}

export function mapProductVariant(variant: RawVariantWithOffers): ProductVariant {
  const hasConfiguredOffers = (variant.offers ?? []).some(
    (offer) => offer.active !== false && offer.source?.active !== false
  );
  const offers = getActiveOffers(variant);
  const pricingTiers: PricingTier[] = offers.map((offer) => ({
    unitPrice: offer.salePrice,
    availableQuantity: offer.stockQuantity,
    fulfillment:
      offer.availabilityMode === "finite" ? "immediate" : "24_48_hours",
  }));
  const finiteStock = offers.reduce(
    (total, offer) =>
      offer.availabilityMode === "finite"
        ? total + Number(offer.stockQuantity ?? 0)
        : total,
    0
  );
  const onDemandAvailable = offers.some(
    (offer) => offer.availabilityMode === "on_demand"
  );
  const partnerOffer = offers.find(
    (offer) => offer.sourceCode === "grandma_store"
  );

  return {
    id: variant.id,
    product_id: variant.product_id,
    size: variant.size ?? "",
    sizeSystem: variant.size_system ?? null,
    color: variant.color ?? null,
    sku: variant.sku ?? null,
    priceOverride:
      pricingTiers[0]?.unitPrice ??
      (variant.price_override == null ? null : Number(variant.price_override)),
    stock: hasConfiguredOffers ? finiteStock : Number(variant.stock ?? 0),
    available: variant.active !== false && pricingTiers.length > 0,
    maxQuantity: onDemandAvailable ? null : finiteStock,
    onDemandAvailable,
    pricingTiers,
    partnerPrice: partnerOffer?.salePrice ?? null,
    partnerAvailable: Boolean(partnerOffer),
    active: variant.active !== false,
  };
}

export function mapProductRow(product: any): ProductWithDetails {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    basePrice: Number(product.base_price) || 0,
    compareAtPrice:
      product.compare_at_price == null ? null : Number(product.compare_at_price),
    brand: product.brand || null,
    categoryId: product.category_id,
    featured: product.featured || false,
    active: product.active !== false,
    createdAt: product.created_at,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
          description: product.category.description,
          image_url: product.category.image_url,
          parent_id: product.category.parent_id,
          sort_order: product.category.sort_order || 0,
          active: product.category.active !== false,
          created_at: product.category.created_at,
        }
      : null,
    images: (product.images || [])
      .sort((first: any, second: any) =>
        Number(first.sort_order ?? 0) - Number(second.sort_order ?? 0)
      )
      .map((image: any) => ({
        id: image.id,
        product_id: image.product_id,
        url: image.url,
        alt: image.alt,
        sort_order: image.sort_order || 0,
      })),
    variants: (product.variants || []).map(mapProductVariant),
  };
}

export function getVariantPricingSegments(
  variant: Pick<ProductVariant, "pricingTiers">,
  quantity: number
) {
  let remaining = Math.max(0, quantity);
  const segments: Array<PricingTier & { quantity: number; lineTotal: number }> = [];

  for (const tier of variant.pricingTiers) {
    if (remaining <= 0) break;

    const allocated =
      tier.availableQuantity == null
        ? remaining
        : Math.min(remaining, tier.availableQuantity);
    if (allocated <= 0) continue;

    segments.push({
      ...tier,
      quantity: allocated,
      lineTotal: allocated * tier.unitPrice,
    });
    remaining -= allocated;
  }

  return { segments, fulfilled: remaining === 0, missingQuantity: remaining };
}

export function getVariantQuantityTotal(
  variant: Pick<ProductVariant, "pricingTiers">,
  quantity: number
) {
  return getVariantPricingSegments(variant, quantity).segments.reduce(
    (total, segment) => total + segment.lineTotal,
    0
  );
}

export function getSizeSystemLabel(sizeSystem: SizeSystem | null) {
  if (sizeSystem === "infant") return "Infantil";
  if (sizeSystem === "adult") return "Adulto";
  return null;
}

export function formatStorefrontVariantSize(
  variant: Pick<ProductVariant, "size" | "sizeSystem">
) {
  const system = getSizeSystemLabel(variant.sizeSystem);
  return system ? `${system} ${variant.size}` : variant.size;
}
