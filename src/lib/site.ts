export const SITE_NAME = "Pilchería Gloria";
export const SITE_LOCALITY = "Libertador General San Martín";
export const SITE_DEPARTMENT = "Ledesma";
export const SITE_REGION = "Jujuy";
export const SITE_REGION_CODE = "AR-Y";
export const SITE_COUNTRY = "Argentina";
export const STORE_LOCATION_ADDRESS = "Feria, pasillo verde, local 49";
export const STORE_LOCATION_REFERENCE = "Pilchería Gloria, local verde manzana";
export const SITE_DESCRIPTION =
  "Uniformes escolares en Libertador General San Martín, Ledesma, Jujuy. Remeras, chombas y envío local gratis desde 2 prendas.";
export const SCHOOL_UNIFORMS_DESCRIPTION =
  "Uniformes escolares para escuelas primarias y secundarias de Ledesma, Jujuy. Remeras, chombas y envío local gratis desde 2 prendas.";

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
