import Link from "next/link";
import type { Metadata } from "next";
import { MessageCircle, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { getProducts } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PromotionTracker } from "@/components/storefront/promotion-tracker";
import { CatalogFilters } from "@/components/storefront/catalog-filters";
import { Button } from "@/components/ui/button";
import { FACEBOOK_PROMOTION, isFacebookPromotion } from "@/lib/promotions";
import { getFacebookPromotionAvailability } from "@/lib/promotions-server";
import { SCHOOL_UNIFORMS_DESCRIPTION } from "@/lib/site";
import { SCHOOL_UNIFORM_FILTERS } from "@/lib/school-uniforms";
import { formatPrice } from "@/lib/utils";

interface ProductsPageProps {
  searchParams: Promise<{
    q?: string;
    school?: string;
    promo?: string;
  }>;
}

const PRODUCTS_SOCIAL_IMAGE = "/social/og/uniformes-escolares-click-2026.png";
const PRODUCTS_SOCIAL_IMAGE_ALT =
  "Uniformes escolares en Pilchería Gloria: tocá la imagen para entrar a la tienda";

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

function getProductsHref({
  q,
  school,
  promo,
}: {
  q?: string;
  school?: string;
  promo?: string;
}) {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (school) query.set("school", school);
  if (promo) query.set("promo", promo);
  const suffix = query.toString();
  return suffix ? `/products?${suffix}` : "/products";
}

export async function generateMetadata({
  searchParams,
}: ProductsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q?.trim();
  const selectedSchool = SCHOOL_UNIFORM_FILTERS.find(
    (school) => school.id === params.school
  );
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
    title: selectedSchool
      ? `Uniformes de ${selectedSchool.name}`
      : query
      ? `Uniformes para ${query}`
      : hasPromotion
        ? promotionTitle
        : "Tienda de uniformes escolares en Ledesma",
    description: hasPromotion
      ? `${promotionDescription} Remeras y chombas de distintas escuelas, con stock real por talle.`
      : SCHOOL_UNIFORMS_DESCRIPTION,
    alternates: { canonical: "/products" },
    robots:
      query || selectedSchool ? { index: false, follow: true } : undefined,
    openGraph: query || selectedSchool
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
          images: [
            {
              url: PRODUCTS_SOCIAL_IMAGE,
              width: 1200,
              height: 630,
              alt: PRODUCTS_SOCIAL_IMAGE_ALT,
            },
          ],
        },
    twitter: query || selectedSchool
      ? undefined
      : {
          card: "summary_large_image",
          title: hasPromotion
            ? promotionTitle
            : "Tienda de uniformes escolares en Ledesma",
          description: hasPromotion
            ? `${promotionSocialDescription} ${promotionDescription}`
            : SCHOOL_UNIFORMS_DESCRIPTION,
          images: [PRODUCTS_SOCIAL_IMAGE],
        },
  };
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const searchTerm = params.q?.trim().slice(0, 80) || undefined;
  const selectedSchool = SCHOOL_UNIFORM_FILTERS.find(
    (school) => school.id === params.school
  );
  const requestedPromotion = isFacebookPromotion(params.promo);
  const [allProducts, settings, promotion] = await Promise.all([
    getProducts({
      categorySlug: "uniformes-escolares",
    }),
    getStoreSettings(),
    requestedPromotion
      ? getFacebookPromotionAvailability()
      : Promise.resolve(null),
  ]);
  const filters = [selectedSchool?.query, searchTerm]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchValue);
  const products = allProducts.filter((product) => {
    const searchable = normalizeSearchValue(
      `${product.name} ${product.description || ""}`
    );
    return filters.every((filter) => searchable.includes(filter));
  });
  const hasPromotion = Boolean(promotion?.available);
  const schoolName = selectedSchool?.name || searchTerm || "__";
  const clearHref = getProductsHref({ promo: params.promo });
  const removeSchoolHref = getProductsHref({
    q: searchTerm,
    promo: params.promo,
  });
  const whatsappUrl = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hola, busco un uniforme escolar. Escuela: ${schoolName}. Prenda: __. Talle: __.`
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
                {selectedSchool
                  ? selectedSchool.name
                  : searchTerm
                    ? `Resultados para “${searchTerm}”`
                    : "Uniformes escolares"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Busque por escuela o prenda. Si no aparece, consúltenos: en el
                negocio tenemos más escuelas y talles que los publicados online.
              </p>
            </div>
            {searchTerm || selectedSchool ? (
              <Button variant="outline" className="w-fit rounded-full" asChild>
                <Link href={clearHref}>
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

        <CatalogFilters
          schools={SCHOOL_UNIFORM_FILTERS}
          selectedSchoolId={selectedSchool?.id}
          searchTerm={searchTerm}
          promotion={params.promo}
        />

        <section
          aria-label="Compra segura"
          className="my-5 grid overflow-hidden rounded-3xl bg-gloria-950 text-white sm:grid-cols-3"
        >
          <div className="flex items-start gap-3 p-4 sm:p-5">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-gloria-300" />
            <div>
              <p className="font-bold">Pago protegido</p>
              <p className="mt-1 text-xs leading-5 text-white/65">Pagás de forma segura en Mercado Pago.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 border-t border-white/10 p-4 sm:border-l sm:border-t-0 sm:p-5">
            <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-gloria-300" />
            <div>
              <p className="font-bold">Sin crear una cuenta</p>
              <p className="mt-1 text-xs leading-5 text-white/65">Podés comprar como invitado desde el celular.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 border-t border-white/10 p-4 sm:border-l sm:border-t-0 sm:p-5">
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-gloria-300" />
            <div>
              <p className="font-bold">Te acompañamos</p>
              <p className="mt-1 text-xs leading-5 text-white/65">Si falta una prenda, coordinamos cambio o devolución.</p>
            </div>
          </div>
        </section>

        {selectedSchool ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span>Filtro activo:</span>
            <Link
              href={removeSchoolHref}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gloria-950 px-4 font-bold text-white transition hover:bg-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-600 focus-visible:ring-offset-2"
            >
              {selectedSchool.name}
              <X className="size-3.5" />
            </Link>
          </div>
        ) : null}

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
