import type { StoreSettings } from "@/types";
import {
  absoluteUrl,
  SCHOOL_UNIFORMS_DESCRIPTION,
  SITE_COUNTRY,
  SITE_DEPARTMENT,
  SITE_DESCRIPTION,
  SITE_LOCALITY,
  SITE_NAME,
  SITE_REGION,
} from "@/lib/site";

type BreadcrumbItem = {
  name: string;
  path: string;
};

function isConfigured(value: string | null | undefined) {
  return Boolean(value && !/completar|confirmar|ejemplo\.com/i.test(value));
}

export function getBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function getStorefrontJsonLd(settings: StoreSettings) {
  const storeId = absoluteUrl("/#store");
  const websiteId = absoluteUrl("/#website");
  const socialProfiles = [
    settings.instagram_url,
    settings.facebook_url,
  ].filter((profile): profile is string => Boolean(profile));
  const contactPhone = isConfigured(settings.contact_phone)
    ? settings.contact_phone
    : settings.whatsapp_phone;

  const store = {
    "@type": "ClothingStore",
    "@id": storeId,
    name: settings.store_name || SITE_NAME,
    alternateName: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon"),
    image: absoluteUrl("/opengraph-image"),
    inLanguage: "es-AR",
    currenciesAccepted: "ARS",
    paymentAccepted: "Mercado Pago, tarjetas de crédito y débito",
    priceRange: "$",
    telephone: contactPhone || undefined,
    email: isConfigured(settings.contact_email)
      ? settings.contact_email
      : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: isConfigured(settings.address_line)
        ? settings.address_line
        : undefined,
      addressLocality: settings.city || SITE_LOCALITY,
      addressRegion: SITE_REGION,
      addressCountry: "AR",
    },
    areaServed: [
      {
        "@type": "City",
        name: SITE_LOCALITY,
      },
      {
        "@type": "AdministrativeArea",
        name: `Departamento ${SITE_DEPARTMENT}, ${SITE_REGION}`,
      },
    ],
    sameAs: socialProfiles.length ? socialProfiles : undefined,
    contactPoint: contactPhone
      ? {
          "@type": "ContactPoint",
          telephone: contactPhone,
          contactType: "customer service",
          areaServed: "AR",
          availableLanguage: "Spanish",
        }
      : undefined,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Uniformes escolares y ropa",
      itemListElement: [
        {
          "@type": "OfferCatalog",
          name: "Uniformes escolares",
          description: SCHOOL_UNIFORMS_DESCRIPTION,
          itemListElement: [
            "Remeras escolares",
            "Chombas escolares",
          ].map((name) => ({
            "@type": "OfferCatalog",
            name,
          })),
        },
        {
          "@type": "OfferCatalog",
          name: "Indumentaria para mujer y hombre",
        },
      ],
    },
  };

  const website = {
    "@type": "WebSite",
    "@id": websiteId,
    name: SITE_NAME,
    alternateName: "Gloria",
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    inLanguage: "es-AR",
    publisher: {
      "@id": storeId,
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [store, website],
  };
}

export const LOCAL_SEO_LABEL =
  `${SITE_LOCALITY}, departamento ${SITE_DEPARTMENT}, ${SITE_REGION}, ${SITE_COUNTRY}`;
