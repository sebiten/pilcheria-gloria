import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { ProductWithDetails } from "@/types";

interface ProductCardProps {
  product: ProductWithDetails;
  priority?: boolean;
}

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1766934587214-86e21b3ae093?auto=format&fit=crop&w=900&q=82";

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
  const availableVariants = getAvailableVariants(product);
  const sizes = new Set(
    availableVariants.map(
      (variant) => `${variant.sizeSystem ?? "legacy"}:${variant.size}`
    )
  ).size;
  const price = getDisplayPrice(product);
  const compareAtPrice = Number(product.compareAtPrice ?? 0);
  const isOffer = compareAtPrice > price;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block h-full rounded-[1.35rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-border/80 bg-card transition duration-300 hover:-translate-y-1 hover:border-gloria-300 hover:shadow-[0_20px_55px_-30px_oklch(0.35_0.085_134/0.45)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#17151a]">
          <Image
            src={product.images?.[0]?.url || FALLBACK_IMAGE}
            alt={product.images?.[0]?.alt || product.name}
            fill
            className="object-contain transition duration-500 ease-out group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {product.featured ? (
              <span className="rounded-full bg-gloria-500 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-gloria-950">
                Destacado
              </span>
            ) : null}
            {isOffer ? (
              <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-gloria-800">
                Oferta
              </span>
            ) : null}
          </div>
          <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-foreground">
            {availableVariants.length > 0
              ? `${sizes || 1} talle${sizes === 1 ? "" : "s"}`
              : "Agotado"}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <p className="min-h-4 text-xs font-bold uppercase tracking-[0.14em] text-gloria-700">
            {product.brand || product.category?.name || "Pilchería Gloria"}
          </p>
          <h2 className="mt-2 line-clamp-2 text-xl font-bold leading-snug text-foreground">
            {product.name}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {product.description || "Conocé talles, colores y disponibilidad."}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div>
              {isOffer ? (
                <p className="text-xs text-muted-foreground line-through">
                  {formatPrice(compareAtPrice)}
                </p>
              ) : null}
              <p className="text-lg font-black tracking-tight text-foreground sm:text-xl">
                {formatPrice(price)}
              </p>
            </div>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:bg-gloria-800">
              <ArrowUpRight className="size-5" />
              <span className="sr-only">Ver {product.name}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
