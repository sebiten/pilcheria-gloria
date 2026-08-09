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
    <main className="bg-background">
      <section className="hero-stage relative isolate border-b border-gloria-200 bg-gloria-50">
        <div aria-hidden="true" className="hero-fabric-texture absolute inset-0" />
        <div className="hero-stage-inner container relative mx-auto px-4 pb-8 pt-6 sm:px-6 sm:pb-11 sm:pt-10 lg:px-4 lg:py-10">
          <div className="relative">
            <div className="relative z-50 flex items-center justify-between gap-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gloria-700 sm:text-sm">
                Uniformes escolares en Ledesma
              </p>
              <p className="hidden text-xs font-extrabold uppercase tracking-[0.16em] text-gloria-800 lg:block">
                Libertador General San Martín · Jujuy
              </p>
            </div>

            <h1 className="mt-4 max-w-full font-display text-[clamp(2.35rem,11.4vw,3.15rem)] leading-[0.88] tracking-[-0.055em] text-gloria-950 sm:mt-6 sm:max-w-[90%] sm:text-[clamp(3.15rem,8vw,4.15rem)] sm:leading-[0.84] lg:mt-7 lg:max-w-none lg:text-[clamp(6rem,9vw,9.3rem)] lg:leading-[0.8] lg:tracking-[-0.06em]">
              <span className="relative z-10 block">Tu escuela.</span>
              <span className="relative z-40 block sm:pl-[4vw] lg:pl-[8vw]">
                Tu uniforme.
              </span>
              <span className="relative z-10 block sm:pl-[1vw] lg:pl-[3vw]">
                Tu talle.
              </span>
            </h1>
          </div>

          <div className="relative z-50 mt-4 max-w-lg lg:absolute lg:bottom-[6%] lg:left-[30%] lg:mt-0 lg:w-[31rem]">
            <p className="max-w-md text-sm font-medium leading-6 text-gloria-900 sm:text-base sm:leading-7">
              <span className="lg:hidden">Elegí escuela, prenda y talle.</span>
              <span className="hidden lg:inline">
                Elegí la escuela, la prenda y el talle. Si todavía no aparece
                online, la buscamos en el negocio.
              </span>
            </p>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row lg:mt-5">
              <Button
                size="lg"
                className="group min-h-12 w-[min(15rem,100%)] justify-between rounded-full bg-gloria-500 px-7 text-gloria-950 shadow-[0_16px_32px_-18px_oklch(0.2_0.045_136/0.5)] transition-transform hover:-translate-y-0.5 hover:bg-gloria-400 sm:w-auto sm:justify-center"
                asChild
              >
                <Link href={catalogHref}>
                  <span className="lg:hidden">Ver tienda</span>
                  <span className="hidden lg:inline">Elegir uniforme</span>
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              {whatsappUrl ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="hidden min-h-12 rounded-full border-gloria-300 bg-gloria-50 px-6 text-gloria-800 hover:bg-gloria-100 lg:inline-flex"
                  asChild
                >
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 size-4" />
                    Consultar por WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="mt-5 hidden flex-col gap-2 text-xs font-bold text-gloria-900 lg:flex lg:flex-row lg:flex-wrap lg:gap-x-5 lg:gap-y-2 lg:text-sm">
              <span className="inline-flex items-center gap-2">
                <Ruler className="size-4 shrink-0 text-gloria-600" />
                Talles infantil, juvenil y adulto
              </span>
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-gloria-600" />
                {pickupConfigured
                  ? `Retiro coordinado en ${settings.address_line}`
                  : "Retiro coordinado"}
              </span>
            </div>
          </div>

          <HeroUniformCollage href={catalogHref} />

          <span
            aria-hidden="true"
            className="absolute bottom-0 left-1/2 h-8 border-l-2 border-dashed border-gloria-700/40 lg:h-12"
          />
        </div>
      </section>

      <PaymentConfidence variant="hero-band" />
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
