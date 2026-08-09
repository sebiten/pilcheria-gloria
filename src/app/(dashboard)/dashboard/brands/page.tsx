import Link from "next/link";
import { renameProductBrand } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/actions/auth";

export default async function BrandsPage() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("products")
    .select("brand")
    .not("brand", "is", null);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data || []) {
    const brand = row.brand?.trim();
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  const brands = Array.from(counts).sort(([a], [b]) =>
    a.localeCompare(b, "es")
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Marcas</h1>
        <p className="text-muted-foreground">
          Las marcas se crean al cargarlas en un producto.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        {brands.map(([brand, count]) => (
          <div
            key={brand}
            className="grid gap-4 border-b p-4 last:border-0 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <Link
                href={`/brands/${encodeURIComponent(brand)}`}
                className="font-bold hover:text-primary"
              >
                {brand}
              </Link>
              <p className="text-sm text-muted-foreground">
                {count} producto{count === 1 ? "" : "s"}
              </p>
            </div>
            <form
              action={renameProductBrand.bind(null, brand)}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            >
              <Input
                name="brand"
                defaultValue={brand}
                aria-label={`Renombrar marca ${brand}`}
                className="min-h-10"
                required
              />
              <Button className="min-h-11" type="submit" variant="outline">
                Guardar
              </Button>
            </form>
          </div>
        ))}
        {!brands.length ? (
          <div className="p-10 text-center text-muted-foreground">
            Todavía no hay marcas cargadas.
          </div>
        ) : null}
      </div>
    </div>
  );
}
