"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/types";

interface ProductGalleryProps {
  productName: string;
  featured: boolean;
  images: ProductImage[];
}

const fallbackImage = "/pilcheria-gloria-facebook.png";

export function ProductGallery({
  productName,
  featured,
  images,
}: ProductGalleryProps) {
  const galleryImages = images.length
    ? images
    : [
        {
          id: "fallback",
          url: fallbackImage,
          alt: "Pilchería Gloria",
          sort_order: 0,
          product_id: "",
        },
      ];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = galleryImages[selectedIndex] ?? galleryImages[0];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-border bg-[#17151a]">
        <Image
          src={selectedImage.url}
          alt={selectedImage.alt || productName}
          fill
          className="object-contain"
          priority
          sizes="(max-width: 1024px) 100vw, 52vw"
        />
        {featured ? (
          <span className="absolute left-4 top-4 rounded-full bg-gloria-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gloria-950">
            Destacado
          </span>
        ) : null}
      </div>

      {galleryImages.length > 1 ? (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {galleryImages.map((image, index) => (
            <button
              key={image.id || image.url}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative aspect-[4/5] min-h-14 overflow-hidden rounded-xl border bg-[#17151a] transition ${
                selectedIndex === index
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-gloria-300"
              }`}
              aria-label={`Ver imagen ${index + 1} de ${productName}`}
            >
              <Image
                src={image.url}
                alt={image.alt || productName}
                fill
                className="object-contain"
                sizes="96px"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
