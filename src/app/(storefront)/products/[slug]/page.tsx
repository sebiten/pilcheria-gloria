import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { getProductBySlug } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { getBreadcrumbJsonLd } from "@/lib/seo";
import { formatPrice } from "@/lib/utils";
import {
  absoluteUrl,
  SITE_LOCALITY,
  SITE_NAME,
} from "@/lib/site";
import { sanitizeStorefrontProduct } from "@/lib/inventory";
import {
  getSchoolDisplayName,
  getUniformDisplayName,
} from "@/lib/school-uniforms";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductGallery } from "./product-gallery";
import { ProductReviews, ProductReviewSummary } from "./product-reviews";
import { ProductShareActions } from "./product-share-actions";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

function getProductPriceRange(product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>) {
  const availablePrices = product.variants
    .filter((variant) => variant.active !== false && variant.available)
    .map((variant) => Number(variant.priceOverride ?? product.basePrice));

  const fallback = Number(product.basePrice);
  return {
    min: availablePrices.length ? Math.min(...availablePrices) : fallback,
    max: availablePrices.length ? Math.max(...availablePrices) : fallback,
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };

  const isDemoProduct = product.slug.startsWith("gloria-demo-");
  const { min: price } = getProductPriceRange(product);
  const productDescription = product.description?.trim();
  const brandTitle =
    product.brand?.toLowerCase() === SITE_NAME.toLowerCase()
      ? ""
      : product.brand
        ? ` | ${product.brand}`
        : "";
  const description = productDescription
    ? `${productDescription.slice(0, 112).replace(/[.,;:\s]+$/, "")}. Disponible en Pilchería Gloria, Ledesma, Jujuy.`
    : `${product.name}${product.brand ? ` de ${product.brand}` : ""} disponible en Pilchería Gloria, Ledesma, Jujuy.`;
  const image = product.images?.[0]?.url;

  return {
    title: `${product.name}${brandTitle}`,
    description,
    alternates: { canonical: `/uniformes/${product.slug}` },
    robots: isDemoProduct ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      title: product.name,
      description: `${description} Precio: ${formatPrice(price)}.`,
      url: `/uniformes/${product.slug}`,
      images: image
        ? [{ url: image, alt: product.images[0]?.alt || product.name }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([
    getProductBySlug(slug),
    getStoreSettings(),
  ]);
  if (!product) notFound();
  const displayName = getUniformDisplayName(product.name);
  const schoolDisplayName = getSchoolDisplayName(product.brand || product.name);

  const activeVariants = product.variants.filter(
    (variant) => variant.active !== false && variant.available
  );
  const { min: price, max: maximumPrice } = getProductPriceRange(product);
  const hasVariablePrice =
    !product.uniformPriceGroup && maximumPrice > price;
  const compareAtPrice = Number(product.compareAtPrice ?? 0);
  const isOffer = compareAtPrice > price;
  const productUrl = absoluteUrl(`/uniformes/${product.slug}`);
  const images = product.images.map((image) => image.url);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    url: productUrl,
    name: product.name,
    description: product.description || undefined,
    image: images,
    sku: activeVariants.find((variant) => variant.sku)?.sku || undefined,
    productID: product.id,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand }
      : undefined,
    category: product.category?.name,
    offers: hasVariablePrice
      ? {
          "@type": "AggregateOffer",
          url: productUrl,
          priceCurrency: "ARS",
          lowPrice: price,
          highPrice: maximumPrice,
          offerCount: activeVariants.length,
          availability: "https://schema.org/InStock",
        }
      : {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "ARS",
          price,
          availability:
            activeVariants.length > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: {
            "@id": absoluteUrl("/#store"),
          },
          areaServed: {
            "@type": "City",
            name: SITE_LOCALITY,
          },
        },
  };
  const breadcrumbJsonLd = getBreadcrumbJsonLd([
    { name: "Inicio", path: "/" },
    { name: "Uniformes", path: "/uniformes" },
    ...(product.category
      ? [
          {
            name: product.category.name,
            path: `/categories/${product.category.slug}`,
          },
        ]
      : []),
    { name: product.name, path: `/uniformes/${product.slug}` },
  ]);

  return (
    <main className="bg-background pb-44 lg:pb-0">
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />

      <section className="border-b border-border">
        <div className="container mx-auto px-4 py-4 sm:py-8">
          <Link
            href="/uniformes"
            className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-gloria-800 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="size-4" />
            Volver a uniformes
          </Link>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-8">
            <header className="order-1 lg:col-start-2 lg:row-start-1">
              <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-gloria-700 lg:block">
                Uniforme de {schoolDisplayName}
              </p>
              <h1 className="font-display text-balance text-3xl leading-[0.98] text-gloria-950 lg:mt-2 sm:text-5xl">
                {displayName}
              </h1>
              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
                <div>
                  {isOffer ? (
                    <p className="text-sm text-muted-foreground line-through">
                      {formatPrice(compareAtPrice)}
                    </p>
                  ) : null}
                  <p className="text-[clamp(1.625rem,8vw,2.25rem)] font-black tracking-tight text-foreground">
                    {hasVariablePrice
                      ? `${formatPrice(price)} – ${formatPrice(maximumPrice)}`
                      : formatPrice(price)}
                  </p>
                </div>
                <span
                  className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    activeVariants.length > 0
                      ? "bg-green-100 text-green-800"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="size-3.5" />
                  {activeVariants.length > 0 ? "Elegí tu talle" : "Consultar"}
                </span>
              </div>
            </header>

            <div className="order-2 animate-gloria-rise lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <ProductGallery
                productName={product.name}
                featured={product.featured}
                images={product.images}
              />
            </div>

            <div
              id="elegir-talle"
              className="order-3 scroll-mt-24 lg:col-start-2 lg:row-start-2 lg:sticky lg:top-24"
            >
              <div className="rounded-[1.5rem] border border-border bg-white p-4 shadow-[0_24px_60px_-42px_oklch(0.35_0.085_134/0.4)] sm:p-7">
                <AddToCartButton
                  product={sanitizeStorefrontProduct(product)}
                  whatsappPhone={settings.whatsapp_phone}
                  productUrl={productUrl}
                />
              </div>
            </div>
          </div>

          <section className="mt-8 grid gap-6 border-t border-border pt-7 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="max-w-2xl space-y-2">
              <details className="rounded-xl border border-border bg-white px-4 py-3">
                <summary className="min-h-8 cursor-pointer font-bold text-gloria-950">
                  Detalles de la prenda
                </summary>
                <p className="pt-2 leading-7 text-muted-foreground">
                  {product.description || "Consultá los talles y elegí la opción que necesitás."}
                </p>
              </details>

              <details className="rounded-xl border border-border bg-white px-4 py-3">
                <summary className="min-h-8 cursor-pointer font-bold text-gloria-950">
                  Envío y retiro
                </summary>
                <div className="space-y-3 pt-2 text-sm leading-6 text-muted-foreground">
                  {settings.pickup_enabled ? (
                    <div>
                      <p className="font-semibold text-foreground">Retiro coordinado</p>
                      <p>Retiro de compras online en {settings.address_line}.</p>
                      <p>{settings.pickup_instructions}</p>
                    </div>
                  ) : null}
                  {settings.local_delivery_enabled ? (
                    <div>
                      <p className="font-semibold text-foreground">Entrega local</p>
                      <p>
                        Disponible en Ledesma y localidades cercanas.
                        {Number(settings.local_delivery_cost) === 0
                          ? " Sin costo desde 2 prendas."
                          : ` Costo: ${formatPrice(settings.local_delivery_cost)}.`}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>

              <details className="rounded-xl border border-border bg-white px-4 py-3">
                <summary className="min-h-8 cursor-pointer font-bold text-gloria-950">
                  Cambios
                </summary>
                <p className="pt-2 text-sm leading-6 text-muted-foreground">
                  Consultá las condiciones y los pasos en nuestra{" "}
                  <Link
                    href="/cambios-y-devoluciones"
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    política de cambios y devoluciones
                  </Link>
                  .
                </p>
              </details>

              <div className="mt-4">
                <ProductReviewSummary productId={product.id} />
              </div>
            </div>
            <ProductShareActions title={product.name} url={productUrl} />
          </section>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <ProductReviews productId={product.id} productSlug={product.slug} />
      </section>

    </main>
  );
}
