import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle, Search, X } from "lucide-react";
import { getProducts } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PromotionTracker } from "@/components/storefront/promotion-tracker";
import { Button } from "@/components/ui/button";
import { FACEBOOK_PROMOTION, isFacebookPromotion } from "@/lib/promotions";
import { getFacebookPromotionAvailability } from "@/lib/promotions-server";
import { SCHOOL_UNIFORMS_DESCRIPTION } from "@/lib/site";
import { formatPrice } from "@/lib/utils";

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string;
    promo?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q?.trim();
  const requestedPromotion = isFacebookPromotion(params.promo);
  const promotion = requestedPromotion
    ? await getFacebookPromotionAvailability()
    : null;
  const hasPromotion = Boolean(promotion?.available);
  const promotionDescription = `$3.000 de descuento para las primeras ${FACEBOOK_PROMOTION.maxUses} compras online de uniformes escolares.`;
  const promotionTitle =
    "Uniformes para distintas escuelas con $3.000 de descuento";
  const promotionSocialDescription =
    "Remeras y chombas desde $20.000, con stock real por talle. Hay más escuelas y opciones disponibles por consulta.";

  return {
    title: query
      ? `Uniformes para ${query}`
      : hasPromotion
        ? promotionTitle
        : "Tienda de uniformes escolares en Ledesma",
    description: hasPromotion
      ? `${promotionDescription} Remeras y chombas de distintas escuelas, con stock real por talle.`
      : SCHOOL_UNIFORMS_DESCRIPTION,
    alternates: { canonical: "/products" },
    robots: query ? { index: false, follow: true } : undefined,
    openGraph: query
      ? undefined
      : {
          title: hasPromotion
            ? promotionTitle
            : "Tienda de uniformes escolares en Ledesma",
          description: hasPromotion
            ? `${promotionSocialDescription} ${promotionDescription}`
            : SCHOOL_UNIFORMS_DESCRIPTION,
          url: hasPromotion
            ? `/products?promo=${FACEBOOK_PROMOTION.code}`
            : "/products",
        },
    twitter: query
      ? undefined
      : {
          card: "summary_large_image",
          title: hasPromotion
            ? promotionTitle
            : "Tienda de uniformes escolares en Ledesma",
          description: hasPromotion
            ? `${promotionSocialDescription} ${promotionDescription}`
            : SCHOOL_UNIFORMS_DESCRIPTION,
        },
  };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const searchTerm = params.q?.trim().slice(0, 80) || undefined;
  const requestedPromotion = isFacebookPromotion(params.promo);
  const [products, settings, promotion] = await Promise.all([
    getProducts({
      categorySlug: "uniformes-escolares",
      searchTerm,
    }),
    getStoreSettings(),
    requestedPromotion
      ? getFacebookPromotionAvailability()
      : Promise.resolve(null),
  ]);
  const hasPromotion = Boolean(promotion?.available);
  const whatsappUrl = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hola, busco un uniforme escolar. Escuela: ${searchTerm || "__"}. Prenda: __. Talle: __.`
      )}`
    : null;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-gloria-50">
        <div className="container mx-auto px-4 py-8 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gloria-700">
            Tienda de uniformes
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl text-gloria-950 sm:text-6xl">
                {searchTerm ? `Resultados para “${searchTerm}”` : "Uniformes escolares"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Busque por escuela o prenda. Si no aparece, consúltenos: en el
                negocio tenemos más escuelas y talles que los publicados online.
              </p>
            </div>
            {searchTerm ? (
              <Button variant="outline" className="w-fit rounded-full" asChild>
                <Link href="/products">
                  <X className="mr-2 size-4" />
                  Ver todos
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-6 sm:py-8">
        {hasPromotion ? (
          <>
            <PromotionTracker />
            <div className="mb-6 flex flex-col gap-4 rounded-3xl bg-gloria-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gloria-300">
                  Quedan {promotion?.remainingUses} de {FACEBOOK_PROMOTION.maxUses} usos disponibles
                </p>
                <p className="mt-2 font-display text-3xl sm:text-4xl">
                  {formatPrice(FACEBOOK_PROMOTION.discountAmount)} de descuento
                </p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  El código quedó guardado y aparecerá en el checkout antes de pagar.
                </p>
              </div>
              <div className="w-fit rounded-2xl border border-gloria-400/60 bg-white/5 px-5 py-3 font-black tracking-[0.16em] text-gloria-200">
                {FACEBOOK_PROMOTION.code}
              </div>
            </div>
          </>
        ) : null}

        <form action="/products" className="flex gap-2">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Buscar por escuela o prenda</span>
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Ej.: FASTA, Normal, chomba o remera"
              className="min-h-12 w-full rounded-full border border-input bg-white pl-11 pr-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <Button type="submit" className="min-h-12 rounded-full px-5 text-base font-bold">
            Buscar
          </Button>
        </form>

        <div className="my-7 flex flex-col gap-4 rounded-3xl border border-gloria-200 bg-gloria-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-bold text-gloria-950">
              ¿Busca otra escuela o un talle que no figura?
            </p>
            <p className="mt-1 text-base leading-7 text-muted-foreground">
              Escriba escuela, prenda y talle. Revisamos el stock del negocio.
            </p>
          </div>
          {whatsappUrl ? (
            <Button className="min-h-12 shrink-0 rounded-full text-base" asChild>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 size-4" />
                Consultar stock
              </a>
            </Button>
          ) : null}
        </div>

        <section aria-label="Listado de uniformes">
          {products.length ? (
            <>
              <p className="mb-5 text-sm font-semibold text-muted-foreground">
                {products.length} uniforme{products.length === 1 ? "" : "s"} disponible
                {products.length === 1 ? "" : "s"} online
              </p>
              <ProductGrid products={products} priorityFirst={1} />
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-gloria-300 bg-gloria-50 px-6 py-16 text-center">
              <h2 className="font-display text-2xl text-gloria-950">
                No está publicado, pero puede estar en el local
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Consulte por WhatsApp y confirmamos escuela, modelo y talle.
              </p>
              {whatsappUrl ? (
                <Button className="mt-6 rounded-full" asChild>
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    Consultar disponibilidad
                  </a>
                </Button>
              ) : (
                <Button className="mt-6 rounded-full" asChild>
                  <Link href="/products">Ver todos</Link>
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
