import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import {
  SITE_NAME,
  STORE_LOCATION_ADDRESS,
  STORE_LOCATION_REFERENCE,
} from "@/lib/site";
import type { StoreSettings } from "@/types";
import { PaymentBrandLogos } from "@/components/storefront/payment-confidence";
import {
  getGoogleMapsDirectionsUrl,
  getPickupAddress,
  hasPickupAddress,
  PICKUP_LOCATION_REFERENCE,
} from "@/lib/maps";

interface FooterProps {
  settings: StoreSettings;
}

export function Footer({ settings }: FooterProps) {
  const hasAddress = hasPickupAddress(settings);
  const pickupAddress = getPickupAddress(settings);
  const mapsUrl = getGoogleMapsDirectionsUrl(pickupAddress);
  const hasHours =
    !/completar|confirmar/i.test(settings.business_hours);
  const hasPhone = settings.contact_phone.toLowerCase() !== "completar";
  const hasEmail = !settings.contact_email.endsWith("@ejemplo.com");
  const footerText =
    /\bpunes?\b|colch[oó]n|sommier|descanso|ropa para mujer|mujer y hombre|m[aá]s de \d+ a[nñ]os/i.test(
      settings.footer_text
    )
      ? "Uniformes escolares en Libertador General San Martín. Más escuelas y talles disponibles en el local."
      : settings.footer_text;

  return (
    <footer className="border-t bg-foreground text-background">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.25fr_0.75fr_0.9fr_0.9fr_1fr]">
          <div className="max-w-sm">
            <Logo inverted />
            <p className="mt-5 text-sm leading-6 text-background/70">
              {footerText}
            </p>
          </div>
          <FooterLinks
            title="Uniformes"
            links={[
              ["/products", "Tienda escolar"],
              ["/#escuelas", "Buscar por escuela"],
              ["/products?q=remera", "Remeras"],
              ["/products?q=chomba", "Chombas"],
            ]}
          />
          <FooterLinks
            title="Ayuda"
            links={[
              ["/cambios-y-devoluciones", "Cambios y devoluciones"],
              ["/terminos", "Términos de compra"],
              ["/privacidad", "Privacidad"],
            ]}
          />
          <div>
            <h2 className="font-bold">Dónde encontrarnos</h2>
            <div className="mt-4 space-y-2 text-sm leading-6 text-background/70">
              <p className="font-semibold text-background">Local en la feria</p>
              <p>{STORE_LOCATION_ADDRESS}</p>
              <p>{STORE_LOCATION_REFERENCE}</p>
              <div className="my-3 border-t border-background/15" />
              <p className="font-semibold text-background">Retiro de pedidos online</p>
              {hasAddress ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-semibold text-background hover:text-white hover:underline"
                >
                  {settings.address_line}
                </a>
              ) : null}
              <p>{settings.city}, {settings.state}</p>
              {hasAddress ? <p>Referencia: {PICKUP_LOCATION_REFERENCE}</p> : null}
              {hasHours ? <p>{settings.business_hours}</p> : null}
              {hasAddress ? <p>Retiro con pedido confirmado.</p> : null}
            </div>
          </div>
          <div>
            <h2 className="font-bold">Contacto</h2>
            <div className="mt-4 space-y-2 text-sm leading-6 text-background/70">
              {hasPhone ? <p>{settings.contact_phone}</p> : null}
              {hasEmail ? <p>{settings.contact_email}</p> : null}
              {!hasPhone && !hasEmail ? (
                <p>Completá los datos de contacto desde el panel.</p>
              ) : null}
              {settings.instagram_url ? <Link className="block hover:text-white" href={settings.instagram_url}>Instagram</Link> : null}
              {settings.facebook_url ? <Link className="block hover:text-white" href={settings.facebook_url}>Facebook</Link> : null}
            </div>
            <Link
              href="/arrepentimiento"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-gloria-400 bg-white px-4 text-center text-sm font-bold text-gloria-950 hover:bg-gloria-100"
            >
              Botón de arrepentimiento
            </Link>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-5 border-t border-background/15 pt-6 text-xs text-background/55 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p>
              © {new Date().getFullYear()} {SITE_NAME}. Todos los derechos reservados.
            </p>
            <p className="mt-2 max-w-xl leading-5">
              Uniformes escolares para primaria y secundaria en
              Libertador General San Martín, Ledesma, Jujuy.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span>Pagos procesados por Mercado Pago</span>
            <PaymentBrandLogos small />
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: Array<[string, string]>;
}) {
  return (
    <div>
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm text-background/70">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="hover:text-white">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
