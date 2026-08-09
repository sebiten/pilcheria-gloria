import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getProducts } from "@/actions/products";
import { getStoreSettings } from "@/actions/store-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Button } from "@/components/ui/button";
import { getBreadcrumbJsonLd } from "@/lib/seo";
import {
  absoluteUrl,
  SCHOOL_UNIFORMS_DESCRIPTION,
  SITE_LOCALITY,
} from "@/lib/site";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getCategories()).find((item) => item.slug === slug);
  if (!category) return { title: "Categoría no encontrada" };

  const isSchoolUniforms = category.slug === "uniformes-escolares";
  const title = isSchoolUniforms
    ? "Uniformes escolares por escuela y talle en Ledesma"
    : `${category.name} en Ledesma, Jujuy`;
  const description = isSchoolUniforms
    ? SCHOOL_UNIFORMS_DESCRIPTION
    : category.description ||
      `${category.name} para comprar online en Pilchería Gloria, ${SITE_LOCALITY}, Ledesma.`;
  const categoryImage = isSchoolUniforms
    ? absoluteUrl("/social/facebook-general/02-varias-escuelas.png")
    : category.image_url
      ? absoluteUrl(category.image_url)
      : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: {
      title,
      description,
      url: `/categories/${category.slug}`,
      images: categoryImage
        ? [{ url: categoryImage, alt: `${category.name} en Pilchería Gloria` }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: categoryImage ? [categoryImage] : undefined,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const [categories, products, settings] = await Promise.all([
    getCategories(),
    getProducts({ categorySlug: slug }),
    getStoreSettings(),
  ]);
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const children = categories.filter((item) => item.parent_id === category.id);
  const isSchoolUniforms = category.slug === "uniformes-escolares";
  const categoryImage = isSchoolUniforms
    ? absoluteUrl("/social/facebook-general/02-varias-escuelas.png")
    : category.image_url
      ? absoluteUrl(category.image_url)
      : undefined;
  const uniformsWhatsappUrl = settings.whatsapp_phone
    ? `https://wa.me/${settings.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        "Hola, quiero consultar por uniformes escolares. La escuela es: "
      )}`
    : null;
  const itemList = {
    "@type": "ItemList",
    name: category.name,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/products/${product.slug}`),
      name: product.name,
      image: product.images[0]?.url,
    })),
  };
  const categoryJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${category.name} en Ledesma, Jujuy`,
        description:
          category.description ||
          `${category.name} disponibles en Pilchería Gloria.`,
        url: absoluteUrl(`/categories/${category.slug}`),
        image: categoryImage,
        inLanguage: "es-AR",
        mainEntity: itemList,
      },
      itemList,
      getBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Productos", path: "/products" },
        { name: category.name, path: `/categories/${category.slug}` },
      ]),
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      <JsonLd data={categoryJsonLd} />
      <header className="border-b border-border bg-gloria-50">
        <div className="container mx-auto px-4 py-10 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gloria-700">
            Colección
          </p>
          <h1 className="mt-2 font-display text-5xl text-gloria-950 sm:text-7xl">
            {category.name}
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            {category.description || "Prendas disponibles con talle, color y stock real."}
          </p>
          {isSchoolUniforms ? (
            <Link
              href="/products?category=uniformes-escolares"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
            >
              Guía de uniformes en Ledesma
            </Link>
          ) : null}
          {children.length ? (
            <nav
              className="mt-6 flex flex-wrap gap-2"
              aria-label={isSchoolUniforms ? "Escuelas" : "Subcategorías"}
            >
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={`/categories/${child.slug}`}
                  className="rounded-full border border-gloria-300 bg-white px-4 py-2 text-sm font-bold text-gloria-800 transition hover:bg-gloria-100"
                >
                  {child.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <section className="container mx-auto px-4 py-8">
        {products.length ? (
          <ProductGrid products={products} priorityFirst={4} />
        ) : (
          <div className="rounded-3xl border border-dashed border-gloria-300 bg-gloria-50 p-12 text-center">
            <h2 className="font-display text-2xl text-gloria-950">
              {isSchoolUniforms
                ? "Consultanos por tu escuela"
                : "Todavía no hay prendas publicadas"}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {isSchoolUniforms
                ? "Decinos la institución, la prenda y el talle que necesitás."
                : "Volvé pronto o revisá el catálogo completo."}
            </p>
            <Button className="mt-6 rounded-full" asChild>
              {isSchoolUniforms && uniformsWhatsappUrl ? (
                <a href={uniformsWhatsappUrl} target="_blank" rel="noreferrer">
                  Consultar uniformes
                </a>
              ) : (
                <Link href="/products">Ver catálogo</Link>
              )}
            </Button>
          </div>
        )}
        {isSchoolUniforms ? (
          <div className="mt-10 border-t border-gloria-200 pt-8">
            <h2 className="font-display text-3xl text-gloria-950">
              Uniformes para primaria y secundaria
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              Consultá remeras y chombas de distintas escuelas de Ledesma en
              talles infantiles, juveniles y de adulto, según la disponibilidad
              de cada modelo.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
