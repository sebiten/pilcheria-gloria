import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getUniformDisplayName } from "@/lib/school-uniforms";
import type { ProductWithDetails } from "@/types";

interface ProductCardProps {
  product: ProductWithDetails;
  priority?: boolean;
}

const FALLBACK_IMAGE = "/pilcheria-gloria-facebook.png";

function getAvailableVariants(product: ProductWithDetails) {
  return product.variants.filter(
    (variant) => variant.active !== false && variant.available
  );
}

function getDisplayPrice(product: ProductWithDetails) {
  const prices = getAvailableVariants(product)
    .map((variant) => Number(variant.priceOverride ?? product.basePrice))
    .filter((price) => Number.isFinite(price) && price >= 0);

  return prices.length ? Math.min(...prices) : Number(product.basePrice);
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const displayName = getUniformDisplayName(product.name);
  const primaryImage = product.images?.[0];
  const availableVariants = getAvailableVariants(product);
  const sizes = new Set(
    availableVariants.map(
      (variant) => `${variant.sizeSystem ?? "legacy"}:${variant.size}`
    )
  ).size;
  const price = getDisplayPrice(product);
  const hasVariablePrice =
    new Set(
      availableVariants.map((variant) =>
        Number(variant.priceOverride ?? product.basePrice)
      )
    ).size > 1;
  const compareAtPrice = Number(product.compareAtPrice ?? 0);
  const isOffer = compareAtPrice > price;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:rounded-[1.35rem] sm:focus-visible:ring-offset-4"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card transition duration-300 hover:-translate-y-1 hover:border-gloria-300 hover:shadow-[0_20px_55px_-30px_oklch(0.35_0.085_134/0.45)] sm:rounded-[1.35rem]">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#17151a]">
          <Image
            src={primaryImage?.url || FALLBACK_IMAGE}
            alt={
              primaryImage?.alt ||
              (primaryImage ? product.name : "Pilchería Gloria")
            }
            fill
            className="object-contain transition duration-500 ease-out group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
          />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
            {product.featured ? (
              <span className="rounded-full bg-gloria-500 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-gloria-950 sm:px-3 sm:text-[0.68rem]">
                Destacado
              </span>
            ) : null}
            {isOffer ? (
              <span className="rounded-full bg-white px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-gloria-800 sm:px-3 sm:text-[0.68rem]">
                Oferta
              </span>
            ) : null}
          </div>
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-[0.68rem] font-bold text-foreground shadow-sm sm:bottom-3 sm:left-3 sm:px-3 sm:text-xs">
            {availableVariants.length > 0
              ? `${sizes || 1} talle${sizes === 1 ? "" : "s"}`
              : "Agotado"}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-5">
          <p className="hidden min-h-4 text-xs font-bold uppercase tracking-[0.14em] text-gloria-700 sm:block">
            {product.brand || product.category?.name || "Pilchería Gloria"}
          </p>
          <h2 className="line-clamp-2 text-base font-extrabold leading-snug text-foreground sm:mt-2 sm:text-xl">
            {displayName}
          </h2>
          <p className="mt-2 hidden line-clamp-2 text-sm leading-5 text-muted-foreground sm:block">
            {product.description || "Conocé talles, colores y disponibilidad."}
          </p>

          <div className="mt-auto flex flex-col items-stretch gap-2 pt-3 min-[380px]:flex-row min-[380px]:items-end min-[380px]:justify-between sm:gap-3 sm:pt-5">
            <div>
              {isOffer ? (
                <p className="text-xs text-muted-foreground line-through">
                  {formatPrice(compareAtPrice)}
                </p>
              ) : null}
              <p className="text-base font-black tracking-tight text-foreground sm:text-xl">
                {hasVariablePrice ? "Desde " : ""}
                {formatPrice(price)}
              </p>
            </div>
            <span className="flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-full bg-primary px-2.5 text-xs font-extrabold text-primary-foreground transition group-hover:bg-gloria-800 sm:min-h-11 sm:px-3">
              <span>Ver</span>
              <ArrowUpRight className="size-4 sm:size-5" />
              <span className="sr-only">talles de {displayName}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
