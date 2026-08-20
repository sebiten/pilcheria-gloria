import { Tags } from "lucide-react";
import { requireAdmin } from "@/actions/auth";
import { UniformPricingForm } from "@/components/dashboard/uniform-pricing-form";
import { getUniformPriceGroups } from "@/lib/uniform-pricing";

export default async function UniformPricingPage() {
  await requireAdmin();
  const groups = await getUniformPriceGroups();
  const remera = groups.find((group) => group.code === "remera");
  const chomba = groups.find((group) => group.code === "chomba");

  if (!remera || !chomba) {
    throw new Error("Falta configurar uno de los precios de uniformes");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-bold text-gloria-700">
          <Tags className="size-4" />
          Precios públicos
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          Precios de uniformes
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Un cambio se aplica a todas las escuelas, diseños y talles. Los
          pedidos ya creados conservan sus importes originales.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <UniformPricingForm
          remeraPrice={remera.price}
          chombaPrice={chomba.price}
        />
      </section>
    </div>
  );
}
