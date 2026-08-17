import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrands, getProducts } from "@/actions/products";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductGrid } from "@/components/storefront/product-grid";
import { Button } from "@/components/ui/button";
import { getBreadcrumbJsonLd } from "@/lib/seo";
import { absoluteUrl, SITE_NAME } from "@/lib/site";

interface BrandPageProps {
  params: Promise<{ brand: string }>;
}

export async function generateMetadata({
  params,
}: BrandPageProps): Promise<Metadata> {
  const requestedBrand = decodeURIComponent((await params).brand);
  const brand = (await getBrands()).find(
    (item) => item.toLowerCase() === requestedBrand.toLowerCase()
  );
  if (!brand) return { title: "Marca no encontrada" };
  const description = `Ropa ${brand} disponible en Pilchería Gloria, Libertador General San Martín, Ledesma, Jujuy.`;
  const title =
    brand.toLowerCase() === SITE_NAME.toLowerCase()
      ? "Colección propia en Ledesma, Jujuy"
      : `${brand} en Ledesma, Jujuy`;

  return {
    title,
    description,
    alternates: { canonical: `/brands/${encodeURIComponent(brand)}` },
    openGraph: {
      title,
      description,
      url: `/brands/${encodeURIComponent(brand)}`,
    },
  };
}

export default async function BrandPage({ params }: BrandPageProps) {
  const requestedBrand = decodeURIComponent((await params).brand);
  const brands = await getBrands();
  const brand = brands.find(
    (item) => item.toLowerCase() === requestedBrand.toLowerCase()
  );
  if (!brand) notFound();
  const products = await getProducts({ brand });
  const itemList = {
    "@type": "ItemList",
    name: `Ropa ${brand}`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/uniformes/${product.slug}`),
      name: product.name,
      image: product.images[0]?.url,
    })),
  };
  const brandJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${brand} en Ledesma, Jujuy`,
        url: absoluteUrl(`/brands/${encodeURIComponent(brand)}`),
        mainEntity: itemList,
      },
      itemList,
      getBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Uniformes", path: "/uniformes" },
        { name: brand, path: `/brands/${encodeURIComponent(brand)}` },
      ]),
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      <JsonLd data={brandJsonLd} />
      <header className="border-b border-border bg-gloria-950 text-white">
        <div className="container mx-auto px-4 py-10 sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gloria-200">
            Marca
          </p>
          <h1 className="mt-2 font-display text-5xl sm:text-7xl">{brand}</h1>
          <p className="mt-3 text-white/65">
            {products.length} producto{products.length === 1 ? "" : "s"} publicado
            {products.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>
      <section className="container mx-auto px-4 py-8">
        {products.length ? (
          <ProductGrid products={products} priorityFirst={1} />
        ) : (
          <div className="rounded-3xl border border-dashed border-gloria-300 p-12 text-center">
            <p className="text-muted-foreground">
              No hay prendas disponibles de esta marca.
            </p>
            <Button className="mt-6 rounded-full" asChild>
              <Link href="/uniformes">Ver catálogo</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
