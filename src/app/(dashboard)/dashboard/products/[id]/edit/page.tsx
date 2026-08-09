import { notFound } from "next/navigation";
import { ProductForm } from "@/components/dashboard/product-form";
import { getCategories, getProductByIdAdmin } from "@/actions/products";
import { requireAdmin } from "@/actions/auth";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireAdmin();
  const [{ id }, categories] = await Promise.all([params, getCategories()]);
  const product = await getProductByIdAdmin(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Editar producto</h1>
        <p className="text-muted-foreground">
          Actualiza datos, variantes e imagenes.
        </p>
      </div>

      <ProductForm categories={categories} mode="edit" product={product} />
    </div>
  );
}
