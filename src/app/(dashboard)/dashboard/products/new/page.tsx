import { ProductForm } from "@/components/dashboard/product-form";
import { getCategories } from "@/actions/products";
import { requireAdmin } from "@/actions/auth";

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Nuevo producto</h1>
        <p className="text-muted-foreground">
          Agrega un nuevo producto al catálogo.
        </p>
      </div>

      <ProductForm categories={categories} mode="create" />
    </div>
  );
}
