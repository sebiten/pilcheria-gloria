import {
  absoluteUrl,
  SITE_COUNTRY,
  SITE_DEPARTMENT,
  SITE_DESCRIPTION,
  SITE_LOCALITY,
  SITE_NAME,
  SITE_REGION,
} from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const content = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

## Informacion principal

- Sitio oficial: ${absoluteUrl("/")}
- Idioma: es-AR
- Ubicacion: ${SITE_LOCALITY}, ${SITE_DEPARTMENT}, ${SITE_REGION}, ${SITE_COUNTRY}
- Actividad: indumentaria, ropa para toda la familia y uniformes escolares

## Paginas importantes

- Catálogo: ${absoluteUrl("/uniformes")}
- Tienda de uniformes escolares: ${absoluteUrl("/uniformes")}
- Cambios y devoluciones: ${absoluteUrl("/cambios-y-devoluciones")}
- Terminos: ${absoluteUrl("/terminos")}
- Privacidad: ${absoluteUrl("/privacidad")}
- Boton de arrepentimiento: ${absoluteUrl("/arrepentimiento")}
- Sitemap: ${absoluteUrl("/sitemap.xml")}

## Criterios de uso

- Consultar cada producto para conocer precio, talles y stock vigentes.
- No asumir disponibilidad de una prenda o uniforme sin verificar el catalogo.
- Para uniformes escolares, indicar escuela, nivel, prenda y talle en la consulta.
`;

  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
