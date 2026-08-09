import { CategoriesManager } from "@/components/dashboard/categories-manager";
import { getCategoriesAdmin } from "@/actions/categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/actions/auth";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "No se pudieron cargar las categorías";
}

export default async function CategoriesPage() {
  await requireAdmin();
  try {
    const categories = await getCategoriesAdmin();

    return <CategoriesManager initialCategories={categories} />;
  } catch (error) {
    const message = getErrorMessage(error);

    console.error("Error loading dashboard categories:", error);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Categorías</h1>
          <p className="text-muted-foreground">
            No se pudo cargar esta seccion del dashboard.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Error al cargar categorías</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild className="min-h-11 w-full sm:w-auto">
              <a href="/dashboard/categories">Reintentar</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
