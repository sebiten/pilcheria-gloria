import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  MapPin,
  MessageCircle,
  PackageCheck,
  Shirt,
} from "lucide-react";
import { getProductBySlug } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { getBreadcrumbJsonLd } from "@/lib/seo";
import { formatPrice } from "@/lib/utils";
import { absoluteUrl, SITE_LOCALITY, SITE_NAME } from "@/lib/site";
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

function getProductPrice(product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>) {
  const availablePrices = product.variants
    .filter((variant) => variant.active !== false && variant.available)
    .map((variant) => Number(variant.priceOverride ?? product.basePrice));

  return availablePrices.length
    ? Math.min(...availablePrices)
    : Number(product.basePrice);
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Producto no encontrado" };

  const isDemoProduct = product.slug.startsWith("gloria-demo-");
  const price = getProductPrice(product);
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
  const availablePrices = new Set(
    activeVariants.map((variant) =>
      Number(variant.priceOverride ?? product.basePrice)
    )
  );
  const hasVariablePrice = availablePrices.size > 1;
  const price = getProductPrice(product);
  const compareAtPrice = Number(product.compareAtPrice ?? 0);
  const isOffer = compareAtPrice > price;
  const productUrl = absoluteUrl(`/uniformes/${product.slug}`);
  const images = product.images.map((image) => image.url);
  const freeLocalDelivery =
    settings.local_delivery_enabled &&
    Number(settings.local_delivery_cost) === 0;
  const fulfillmentBenefits = [
    {
      icon: Shirt,
      title: "Talles claros",
      text: "Elegí el diseño y el talle antes de comprar.",
    },
    ...(settings.pickup_enabled
      ? [
          {
            icon: MapPin,
            title: "Retiro coordinado",
            text: settings.pickup_instructions,
          },
        ]
      : []),
    ...(settings.local_delivery_enabled
      ? [
          {
            icon: PackageCheck,
            title: freeLocalDelivery
              ? "Envío gratis desde 2 prendas"
              : "Entrega local desde 2 prendas",
            text: "Disponible en Ledesma y localidades cercanas.",
          },
        ]
      : []),
    {
      icon: CreditCard,
      title: "Mercado Pago",
      text: "Pago online procesado de forma segura.",
    },
  ];
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
    offers: {
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
    <main className="bg-background pb-28 lg:pb-0">
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
                    {hasVariablePrice ? "Desde " : ""}
                    {formatPrice(price)}
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
            <div className="max-w-2xl">
              <h2 className="text-lg font-extrabold text-gloria-950">Sobre esta prenda</h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                {product.description || "Consultá los talles y elegí la opción que necesitás."}
              </p>
              <div className="mt-4">
                <ProductReviewSummary productId={product.id} />
              </div>
            </div>
            <ProductShareActions title={product.name} url={productUrl} />
          </section>
        </div>
      </section>

      <section className="border-b border-border bg-gloria-50 py-10">
        <div className="container mx-auto grid grid-cols-2 gap-3 px-4 lg:grid-cols-4">
          {fulfillmentBenefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <article
                key={benefit.title}
                className="rounded-2xl border border-gloria-200 bg-white p-4 sm:p-5"
              >
                <Icon className="size-5 text-gloria-700" />
                <h2 className="mt-4 font-bold text-gloria-950">{benefit.title}</h2>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground sm:text-sm">
                  {benefit.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-16">
        <ProductReviews productId={product.id} productSlug={product.slug} />
      </section>

      {settings.whatsapp_phone ? (
        <section className="bg-gloria-950 py-12 text-white">
          <div className="container mx-auto flex flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-3xl">¿Tenés dudas con el talle?</p>
              <p className="mt-2 text-white/65">
                Consultanos antes de comprar y te ayudamos.
              </p>
            </div>
            <Link
              href={`https://wa.me/${settings.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                `Hola, quiero consultar por ${product.name}. ${productUrl}`
              )}`}
              target="_blank"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 font-bold text-gloria-950"
            >
              <MessageCircle className="mr-2 size-5" />
              Consultar por WhatsApp
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
