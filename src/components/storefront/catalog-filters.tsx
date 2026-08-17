"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchoolUniformFilter } from "@/lib/school-uniforms";
import { trackStorefrontEvent } from "@/lib/analytics/client";

type GarmentFilter = "remera" | "chomba";

type CatalogFiltersProps = {
  schools: SchoolUniformFilter[];
  selectedSchoolId?: string;
  selectedGarment?: GarmentFilter;
  searchTerm?: string;
  promotion?: string;
};

export function CatalogFilters({
  schools,
  selectedSchoolId,
  selectedGarment,
  searchTerm,
  promotion,
}: CatalogFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = ({
    school = selectedSchoolId || "",
    query = searchTerm || "",
    garment = selectedGarment,
  }: {
    school?: string;
    query?: string;
    garment?: GarmentFilter;
  }) => {
    const params = new URLSearchParams();
    if (school) params.set("school", school);
    if (query.trim()) params.set("q", query.trim().slice(0, 80));
    if (garment) params.set("garment", garment);
    if (promotion) params.set("promo", promotion);
    const suffix = params.toString();
    startTransition(() =>
      router.replace(suffix ? `/uniformes?${suffix}` : "/uniformes")
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const school = String(data.get("school") ?? "");
    trackStorefrontEvent({
      event: "catalog_search",
      schoolId: school || undefined,
    });
    navigate({
      school,
      query: String(data.get("q") ?? ""),
      garment: selectedGarment,
    });
  };

  const chooseGarment = (garment?: GarmentFilter) => {
    navigate({ garment });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gloria-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-5"
      aria-busy={isPending}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block px-1 text-base font-extrabold text-gloria-950">
            Elegí tu escuela
          </span>
          <select
            key={selectedSchoolId || "all-schools"}
            name="school"
            defaultValue={selectedSchoolId || ""}
            onChange={(event) => {
              const schoolId = event.target.value;
              if (schoolId) {
                trackStorefrontEvent({ event: "select_school", schoolId });
              }
              navigate({ school: schoolId, query: "" });
            }}
            className="min-h-14 w-full rounded-2xl border border-input bg-gloria-50 px-4 text-base font-bold text-gloria-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">Todas las escuelas</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1.5 block px-1 text-sm font-bold text-gloria-900">
            ¿Qué prenda buscás?
          </span>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-gloria-100 p-1" aria-label="Filtrar por prenda">
            {([
              [undefined, "Todas"],
              ["remera", "Remeras"],
              ["chomba", "Chombas"],
            ] as const).map(([value, label]) => {
              const active = selectedGarment === value;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseGarment(value)}
                  className={`min-h-12 rounded-xl px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    active
                      ? "bg-gloria-950 text-white shadow-sm"
                      : "text-gloria-900 hover:bg-white/70"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <details className="mt-3 border-t border-gloria-100 pt-3" open={Boolean(searchTerm)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-sm font-bold text-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Search className="size-4" />
          Escribir escuela o prenda
        </summary>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            id="catalog-search"
            name="q"
            defaultValue={searchTerm}
            placeholder="Ej. Galán o chomba"
            aria-label="Escribir escuela o prenda"
            className="min-h-12 w-full rounded-xl border border-input bg-white px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <Button type="submit" className="min-h-12 px-5 font-bold" disabled={isPending}>
            {isPending ? "Buscando…" : "Buscar"}
          </Button>
        </div>
      </details>

      <p className="sr-only" aria-live="polite">
        {isPending
          ? "Mostrando los uniformes…"
          : "Los resultados cambian al elegir escuela o prenda."}
      </p>
    </form>
  );
}
