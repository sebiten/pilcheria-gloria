import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageCheck,
  Ruler,
} from "lucide-react";
import { getProducts } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { PaymentConfidence } from "@/components/storefront/payment-confidence";
import { HeroUniformCollage } from "@/components/storefront/hero-uniform-collage";
import { ProductGrid } from "@/components/storefront/product-grid";
import { SchoolUniformsCarousel } from "@/components/storefront/school-uniforms-carousel";
import { Button } from "@/components/ui/button";
import { SITE_DESCRIPTION } from "@/lib/site";
import {
  getGoogleMapsDirectionsUrl,
  getGoogleMapsEmbedUrl,
  getPickupAddress,
  hasPickupAddress,
  PICKUP_LOCATION_REFERENCE,
} from "@/lib/maps";

export const metadata: Metadata = {
  title: "Uniformes escolares en Ledesma, Jujuy",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Uniformes escolares en Ledesma, Jujuy",
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

const catalogHref = "/products?category=uniformes-escolares";
export default async function HomePage() {
  const [products, settings] = await Promise.all([
    getProducts({ categorySlug: "uniformes-escolares", limit: 8 }),
    getStoreSettings(),
  ]);
  const whatsappUrl = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        "Hola, busco un uniforme escolar. Escuela: __. Prenda: __. Talle: __."
      )}`
    : null;
  const pickupAddress = getPickupAddress(settings);
  const pickupConfigured =
    settings.pickup_enabled && hasPickupAddress(settings);
  const mapsUrl = getGoogleMapsDirectionsUrl(pickupAddress);
  const mapEmbedUrl = getGoogleMapsEmbedUrl(pickupAddress);
  const fulfillmentCards = [
    ...(settings.pickup_enabled
      ? [["Retiro", settings.address_line, MapPin] as const]
      : []),
    ...(settings.local_delivery_enabled
      ? [["Entrega", "Desde 2 prendas", PackageCheck] as const]
      : []),
    ["Pago", "Mercado Pago", CreditCard] as const,
    ["Consulta", "Por WhatsApp", MessageCircle] as const,
  ];

  return (
    <main className="overflow-hidden bg-background">
      <section className="relative isolate border-b border-border bg-gloria-50">
        <div className="absolute -left-32 top-16 size-72 rounded-full bg-gloria-200/70 blur-3xl" />
        <div className="container relative mx-auto grid min-h-[calc(100svh-4.5rem)] items-center gap-10 px-4 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div className="animate-gloria-rise z-10 max-w-2xl">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-gloria-700">
              Uniformes escolares en Ledesma
            </p>
            <h1 className="font-display text-balance text-5xl leading-[0.94] tracking-[-0.045em] text-gloria-950 sm:text-7xl lg:text-[5.4rem]">
              El uniforme de su escuela, en el talle que necesita.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Consulte el stock publicado o escríbanos por talles y escuelas que
              todavía no aparecen online. En el local tenemos más modelos disponibles.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="min-h-12 rounded-full bg-gloria-500 px-7 text-gloria-950 hover:bg-gloria-400"
                asChild
              >
                <Link href={catalogHref}>
                  Ver tienda de uniformes
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              {whatsappUrl ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-12 rounded-full border-gloria-300 bg-white px-7 text-gloria-800"
                  asChild
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 size-4" />
                    Consultar talle o escuela
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-gloria-900">
              <span className="inline-flex items-center gap-2">
                <Ruler className="size-4 text-gloria-600" />
                Talles infantil, juvenil y adulto
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-gloria-600" />
                {pickupConfigured
                  ? `Retiro coordinado en ${settings.address_line}`
                  : "Retiro coordinado"}
              </span>
            </div>
          </div>

          <HeroUniformCollage href={catalogHref} />
        </div>
      </section>

      <PaymentConfidence />
      <SchoolUniformsCarousel whatsappPhone={settings.whatsapp_phone} />

      <section className="border-y border-border bg-white py-16 sm:py-20">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-gloria-700">
                Stock en casa
              </p>
              <h2 className="mt-2 font-display text-3xl text-gloria-950 sm:text-5xl">
                Uniformes disponibles online
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Estos son los modelos cargados. En el negocio hay más talles y
                uniformes de otras escuelas.
              </p>
            </div>
            <Button variant="outline" className="hidden rounded-full sm:flex" asChild>
              <Link href={catalogHref}>Ver catálogo completo</Link>
            </Button>
          </div>
          {products.length ? (
            <ProductGrid products={products} priorityFirst={4} />
          ) : (
            <div className="rounded-3xl border border-dashed border-gloria-300 bg-gloria-50 px-6 py-14 text-center">
              <p className="font-display text-2xl text-gloria-950">
                Estamos cargando el catálogo.
              </p>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex font-bold text-gloria-800 underline"
                >
                  Consultar stock por WhatsApp
                </a>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="bg-gloria-950 py-14 text-white">
        <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-[1fr_1.35fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-gloria-200">
              Compra simple
            </p>
            <h2 className="mt-2 font-display text-3xl sm:text-5xl">
              Del catálogo al local.
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fulfillmentCards.map(([title, text, Icon]) => (
              <div key={title} className="rounded-2xl bg-white/8 p-4">
                <Icon className="size-5 text-gloria-200" />
                <p className="mt-4 font-bold">{title}</p>
                <p className="mt-1 text-xs text-white/65">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {pickupConfigured ? (
        <section
          id="retiro"
          className="scroll-mt-24 border-b border-border bg-white py-16 sm:py-20"
        >
          <div className="container mx-auto px-4">
            <div className="grid overflow-hidden rounded-[2rem] border border-gloria-200 bg-gloria-950 shadow-[0_30px_80px_-45px_oklch(0.28_0.08_134/0.55)] lg:grid-cols-[0.8fr_1.2fr]">
              <div className="flex flex-col justify-center p-7 text-white sm:p-10 lg:p-12">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gloria-200">
                  Punto de retiro
                </p>
                <h2 className="mt-3 font-display text-4xl leading-none sm:text-5xl">
                  Retire su compra en {settings.address_line}.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-6 text-white/70 sm:text-base">
                  El stock publicado online se retira en este domicilio de
                  Libertador General San Martín, con pedido confirmado y horario
                  coordinado previamente.
                </p>

                <div className="mt-7 rounded-2xl border border-white/12 bg-white/8 p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gloria-400 text-gloria-950">
                      <MapPin className="size-5" />
                    </span>
                    <div>
                      <p className="font-bold">{settings.address_line}</p>
                      <p className="mt-1 text-sm text-white/65">
                        {settings.city}, {settings.state}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-gloria-200">
                        Referencia: {PICKUP_LOCATION_REFERENCE}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="mt-6 w-fit rounded-full bg-gloria-400 px-6 text-gloria-950 hover:bg-gloria-300"
                  asChild
                >
                  <a href={mapsUrl} target="_blank" rel="noreferrer">
                    Cómo llegar con Google Maps
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                </Button>
                <p className="mt-4 text-xs leading-5 text-white/50">
                  No se atiende sin coordinación previa. Le avisamos por WhatsApp
                  cuando el pedido está listo.
                </p>
              </div>

              <div className="min-h-[25rem] bg-gloria-100 lg:min-h-[34rem]">
                <iframe
                  src={mapEmbedUrl}
                  title={`Mapa del punto de retiro en ${pickupAddress}`}
                  className="h-full min-h-[25rem] w-full border-0 lg:min-h-[34rem]"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="relative overflow-hidden bg-gloria-100 py-16 sm:py-20">
        <div className="absolute -right-20 top-0 size-72 rounded-full bg-gloria-300/35 blur-3xl" />
        <div className="container relative mx-auto flex flex-col items-start justify-between gap-8 px-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-gloria-700">
              ¿No encuentra su escuela o talle?
            </p>
            <h2 className="mt-3 font-display text-4xl text-gloria-950 sm:text-6xl">
              Lo buscamos en el negocio.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Díganos escuela, prenda y talle. Confirmamos el stock real antes
              de que vaya al local.
            </p>
          </div>
          <Button size="lg" className="min-h-12 rounded-full px-7" asChild>
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
            ) : (
              <Link href={catalogHref}>Ver catálogo escolar</Link>
            )}
          </Button>
        </div>
      </section>
    </main>
  );
}
