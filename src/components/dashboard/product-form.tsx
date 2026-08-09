"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import type { Category, ProductWithDetails, SizeSystem } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveProduct,
  uploadProductImage,
} from "@/actions/products";
import { slugify } from "@/lib/utils";

interface VariantFormValue {
  formId: string;
  size: string;
  sizeSystem: SizeSystem | null;
  color: string;
  sku: string;
  priceOverride: number | null;
  stock: number;
  partnerPrice: number | null;
  partnerAvailable: boolean;
  active: boolean;
}

interface ImageFormValue {
  url: string;
  alt: string;
}

interface ProductFormProps {
  categories: Category[];
  mode: "create" | "edit";
  product?: ProductWithDetails;
}

const defaultVariants: VariantFormValue[] = [
  {
    formId: "default-variant",
    size: "S",
    sizeSystem: null,
    color: "",
    sku: "",
    priceOverride: null,
    stock: 0,
    partnerPrice: null,
    partnerAvailable: false,
    active: true,
  },
];

const MAX_IMAGE_DIMENSION = 1800;
const WEBP_QUALITY = 0.84;

function normalizeVariantValues(variants: VariantFormValue[]) {
  const normalized = new Map<string, VariantFormValue>();

  for (const variant of variants) {
    const size = variant.size.trim();
    const color = variant.color.trim();
    if (!size) continue;

    const key = `${variant.sizeSystem ?? "legacy"}:${size.toLocaleLowerCase("es-AR")}:${color.toLocaleLowerCase("es-AR")}`;
    const existing = normalized.get(key);

    if (!existing) {
      normalized.set(key, {
        ...variant,
        size,
        color,
        sku: variant.sku.trim(),
      });
      continue;
    }

    normalized.set(key, {
      ...existing,
      sku: existing.sku || variant.sku.trim(),
      priceOverride: existing.priceOverride ?? variant.priceOverride,
      stock: existing.stock + variant.stock,
      partnerPrice: existing.partnerPrice ?? variant.partnerPrice,
      partnerAvailable:
        existing.partnerAvailable || variant.partnerAvailable,
      active: existing.active || variant.active,
    });
  }

  return Array.from(normalized.values());
}

async function convertImageToWebp(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Seleccioná un archivo de imagen válido");
  }

  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(imageBitmap.width, imageBitmap.height)
  );
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    imageBitmap.close();
    throw new Error("No se pudo procesar la imagen");
  }

  context.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });

  if (!blob) {
    throw new Error("El navegador no pudo convertir la imagen a WebP");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "producto";
  return new File([blob], `${slugify(baseName)}.webp`, {
    type: "image/webp",
  });
}

export function ProductForm({
  categories,
  mode,
  product,
}: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [basePrice, setBasePrice] = useState(String(product?.basePrice ?? ""));
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compareAtPrice ? String(product.compareAtPrice) : ""
  );
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [variants, setVariants] = useState<VariantFormValue[]>(
    product?.variants?.length
      ? product.variants.map((variant) => ({
          formId: variant.id,
          size: variant.size,
          sizeSystem: variant.sizeSystem,
          color: variant.color ?? "",
          sku: variant.sku ?? "",
          priceOverride: variant.priceOverride,
          stock: variant.stock,
          partnerPrice: variant.partnerPrice,
          partnerAvailable: variant.partnerAvailable,
          active: variant.active,
        }))
      : defaultVariants
  );
  const [images, setImages] = useState<ImageFormValue[]>(
    product?.images?.map((image) => ({
      url: image.url,
      alt: image.alt ?? "",
    })) ?? []
  );
  const [guideColor, setGuideColor] = useState(
    product?.variants.find((variant) => variant.color)?.color ?? ""
  );
  const [guidePrices, setGuidePrices] = useState({
    infantSmall: "",
    infantLarge: "",
    adultSmall: "",
    adultLarge: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentCategories = new Map(
    categories.map((category) => [category.id, category])
  );
  const sortedCategories = [...categories].sort((a, b) => {
    if (a.parent_id === b.id) return 1;
    if (b.parent_id === a.id) return -1;
    return a.sort_order - b.sort_order;
  });

  const updateVariant = (
    index: number,
    field: keyof VariantFormValue,
    value: string | number | boolean | null
  ) => {
    setVariants((current) =>
      current.map((variant, currentIndex) =>
        currentIndex === index ? { ...variant, [field]: value } : variant
      )
    );
  };

  const applyGuidePrices = () => {
    const groups: Array<{
      sizeSystem: SizeSystem;
      sizes: string[];
      price: number;
    }> = [
      {
        sizeSystem: "infant",
        sizes: ["4", "6", "8", "10"],
        price: Number(guidePrices.infantSmall),
      },
      {
        sizeSystem: "infant",
        sizes: ["12", "14", "16"],
        price: Number(guidePrices.infantLarge),
      },
      {
        sizeSystem: "adult",
        sizes: ["1", "2", "3", "4"],
        price: Number(guidePrices.adultSmall),
      },
      {
        sizeSystem: "adult",
        sizes: ["5", "6"],
        price: Number(guidePrices.adultLarge),
      },
    ];
    const validGroups = groups.filter(
      (group) => Number.isFinite(group.price) && group.price > 0
    );

    if (!validGroups.length) {
      setError("Ingresá al menos un precio de la guía");
      return;
    }

    setError(null);
    setVariants((current) => {
      const next = [...current];

      for (const group of validGroups) {
        for (const size of group.sizes) {
          const existingIndex = next.findIndex(
            (variant) =>
              variant.sizeSystem === group.sizeSystem &&
              variant.size.trim() === size &&
              variant.color.trim().toLocaleLowerCase("es-AR") ===
                guideColor.trim().toLocaleLowerCase("es-AR")
          );

          if (existingIndex >= 0) {
            next[existingIndex] = {
              ...next[existingIndex],
              partnerPrice: group.price,
              partnerAvailable: true,
              active: true,
            };
            continue;
          }

          next.push({
            formId: crypto.randomUUID(),
            size,
            sizeSystem: group.sizeSystem,
            color: guideColor.trim(),
            sku: "",
            priceOverride: null,
            stock: 0,
            partnerPrice: group.price,
            partnerAvailable: true,
            active: true,
          });
        }
      }

      return next;
    });
  };

  const handleImageFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setIsUploadingImage(true);
    setError(null);

    try {
      const uploadedImages: ImageFormValue[] = [];

      for (const file of files) {
        const webpFile = await convertImageToWebp(file);
        const formData = new FormData();
        formData.append("file", webpFile);
        const uploaded = await uploadProductImage(formData);
        uploadedImages.push({
          url: uploaded.url,
          alt: name || file.name.replace(/\.[^.]+$/, ""),
        });
      }

      setImages((current) => [...current, ...uploadedImages]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "No se pudo subir la imagen"
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        slug,
        description,
        brand: brand || null,
        basePrice: Number(basePrice),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
        categoryId: categoryId || null,
        featured,
        active,
        images: images.filter((image) => image.url.trim()),
        variants: normalizeVariantValues(variants).map((variant) => ({
          size: variant.size,
          sizeSystem: variant.sizeSystem,
          color: variant.color || null,
          sku: variant.sku || null,
          priceOverride: variant.priceOverride,
          stock: variant.stock,
          partnerPrice: variant.partnerPrice,
          partnerAvailable: variant.partnerAvailable,
          active: variant.active,
        })),
      };

      const result = await saveProduct(
        payload,
        mode === "edit" ? product!.id : undefined
      );

      if (!result.ok) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      window.location.href = "/dashboard/products";
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar el producto"
      );
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Información de la prenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre del producto" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setName(nextName);
                  if (!product?.slug || slug === product.slug || slug === slugify(name)) {
                    setSlug(slugify(nextName));
                  }
                }}
                required
              />
            </Field>
            <Field label="Marca" htmlFor="brand">
              <Input
                id="brand"
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                placeholder="M51, Taverniti..."
              />
            </Field>
          </div>

          <Field label="Slug" htmlFor="slug">
            <Input
              id="slug"
              value={slug}
              onChange={(event) => setSlug(slugify(event.target.value))}
              required
            />
          </Field>

          <Field label="Descripción" htmlFor="description">
            <textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Precio" htmlFor="basePrice">
              <Input id="basePrice" type="number" min="0" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} required />
            </Field>
            <Field label="Precio anterior" htmlFor="compareAtPrice">
              <Input id="compareAtPrice" type="number" min="0" step="0.01" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} />
            </Field>
            <Field label="Categoría" htmlFor="categoryId">
              <select
                id="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sin categoría</option>
                {sortedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parent_id
                      ? `${parentCategories.get(category.parent_id)?.name ?? ""} / `
                      : ""}
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-6">
            <Check label="Destacado" checked={featured} onChange={setFeatured} />
            <Check label="Activo" checked={active} onChange={setActive} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guía de precios del negocio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Crea o actualiza todos los talles disponibles en 24–48 horas. Los
            precios corresponden a la última columna de la guía.
          </p>
          <div className="grid gap-4 md:grid-cols-5">
            <Field label="Color / modelo">
              <Input
                value={guideColor}
                onChange={(event) => setGuideColor(event.target.value)}
                placeholder="Blanco con logo"
              />
            </Field>
            {[
              ["infantSmall", "Infantil 4–10"],
              ["infantLarge", "Infantil 12–16"],
              ["adultSmall", "Adulto 1–4"],
              ["adultLarge", "Adulto 5–6"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={guidePrices[key as keyof typeof guidePrices]}
                  onChange={(event) =>
                    setGuidePrices((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <Button className="min-h-11 w-full sm:w-auto" type="button" variant="outline" onClick={applyGuidePrices}>
            Aplicar guía a todos los talles
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Talles, colores y stock</CardTitle>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            onClick={() =>
              setVariants((current) => [
                ...current,
                {
                  formId: crypto.randomUUID(),
                  size: "",
                  sizeSystem: null,
                  color: "",
                  sku: "",
                  priceOverride: null,
                  stock: 0,
                  partnerPrice: null,
                  partnerAvailable: false,
                  active: true,
                },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Agregar variante
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {variants.map((variant, index) => (
            <div
              key={variant.formId}
              className="grid gap-4 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <Field label="Talle">
                <Input value={variant.size} onChange={(event) => updateVariant(index, "size", event.target.value)} placeholder="S, M, 42..." />
              </Field>
              <Field label="Escala">
                <select
                  value={variant.sizeSystem ?? ""}
                  onChange={(event) =>
                    updateVariant(
                      index,
                      "sizeSystem",
                      (event.target.value || null) as SizeSystem | null
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sin escala</option>
                  <option value="infant">Infantil</option>
                  <option value="adult">Adulto</option>
                </select>
              </Field>
              <Field label="Color">
                <Input value={variant.color} onChange={(event) => updateVariant(index, "color", event.target.value)} placeholder="Azul" />
              </Field>
              <Field label="SKU">
                <Input value={variant.sku} onChange={(event) => updateVariant(index, "sku", event.target.value)} placeholder="Opcional" />
              </Field>
              <Field label="Precio especial">
                <Input type="number" min="0" step="0.01" value={variant.priceOverride ?? ""} onChange={(event) => updateVariant(index, "priceOverride", event.target.value ? Number(event.target.value) : null)} />
              </Field>
              <Field label="Stock">
                <Input type="number" min="0" value={variant.stock} onChange={(event) => updateVariant(index, "stock", Number(event.target.value))} />
              </Field>
              <Field label="Precio negocio">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.partnerPrice ?? ""}
                  onChange={(event) =>
                    updateVariant(
                      index,
                      "partnerPrice",
                      event.target.value ? Number(event.target.value) : null
                    )
                  }
                />
              </Field>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
                <Check
                  label="Disponible 24–48 h"
                  checked={variant.partnerAvailable}
                  onChange={(value) =>
                    updateVariant(index, "partnerAvailable", value)
                  }
                />
                <Check label="Activa" checked={variant.active} onChange={(value) => updateVariant(index, "active", value)} />
                <Button className="h-11 w-11 text-destructive hover:text-destructive" type="button" variant="ghost" size="icon" aria-label="Eliminar variante" onClick={() => setVariants((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Imágenes</CardTitle>
          <div className="w-full sm:w-auto">
            <Input
              id="productImages"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={isUploadingImage || isSubmitting}
              onChange={async (event) => {
                await handleImageFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button className="min-h-11 w-full sm:w-auto" type="button" disabled={isUploadingImage || isSubmitting} onClick={() => document.getElementById("productImages")?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {isUploadingImage ? "Subiendo..." : "Subir imágenes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!images.length ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-muted-foreground">
              <ImageIcon className="mb-3 h-10 w-10" />
              <p>No hay imágenes cargadas.</p>
              <p className="mt-1 text-xs">Se convierten a WebP antes de subirlas a Supabase Storage.</p>
            </div>
          ) : null}

          {images.map((image, index) => (
            <div key={`${image.url}-${index}`} className="grid gap-4 rounded-xl border p-4 md:grid-cols-[8rem_1fr_auto]">
              <div className="relative aspect-[4/5] w-full max-w-40 overflow-hidden rounded-lg border bg-muted">
                <Image src={image.url} alt={image.alt || name || "Producto"} fill className="object-cover" sizes="8rem" />
              </div>
              <Field label="Texto alternativo">
                <Input
                  value={image.alt}
                  onChange={(event) =>
                    setImages((current) =>
                      current.map((item, currentIndex) =>
                        currentIndex === index
                          ? { ...item, alt: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </Field>
              <div className="flex items-end justify-end">
                <Button className="h-11 w-11 text-destructive hover:text-destructive" type="button" variant="ghost" size="icon" aria-label="Eliminar imagen" onClick={() => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="sticky bottom-0 z-20 -mx-4 grid grid-cols-2 gap-3 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:flex sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button className="min-h-11" type="submit" disabled={isSubmitting || isUploadingImage}>
          {isSubmitting ? "Guardando..." : "Guardar producto"}
        </Button>
        <Button className="min-h-11" variant="outline" asChild>
          <Link href="/dashboard/products">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
