import type { MetadataRoute } from "next";
import { getProducts } from "@/actions/products";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts({ categorySlug: "uniformes-escolares" });
  const now = new Date();
  const indexableProducts = products.filter(
    (product) => !product.slug.startsWith("gloria-demo-")
  );
  const uniformImageUrls = indexableProducts
    .flatMap((product) => product.images.map((image) => image.url))
    .slice(0, 12);

  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/uniformes"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/categories/uniformes-escolares"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
      images: uniformImageUrls.length ? uniformImageUrls : undefined,
    },
    ...[
      "/cambios-y-devoluciones",
      "/terminos",
      "/privacidad",
      "/arrepentimiento",
    ].map((path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "/arrepentimiento" ? 0.6 : 0.5,
    })),
    ...indexableProducts.map((product) => ({
      url: absoluteUrl(`/uniformes/${product.slug}`),
      lastModified: new Date(product.createdAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: product.images.length
        ? product.images.map((image) => image.url)
        : undefined,
    })),
  ];
}
