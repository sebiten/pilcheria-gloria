"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchoolUniformFilter } from "@/lib/school-uniforms";
import { trackStorefrontEvent } from "@/lib/analytics/client";

type CatalogFiltersProps = {
  schools: SchoolUniformFilter[];
  selectedSchoolId?: string;
  searchTerm?: string;
  promotion?: string;
};

export function CatalogFilters({
  schools,
  selectedSchoolId,
  searchTerm,
  promotion,
}: CatalogFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (school: string, query: string) => {
    const params = new URLSearchParams();
    if (school) params.set("school", school);
    if (query.trim()) params.set("q", query.trim().slice(0, 80));
    if (promotion) params.set("promo", promotion);
    const suffix = params.toString();
    startTransition(() => router.replace(suffix ? `/products?${suffix}` : "/products"));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const school = String(data.get("school") ?? "");
    trackStorefrontEvent({
      event: "catalog_search",
      schoolId: school || undefined,
    });
    navigate(school, String(data.get("q") ?? ""));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-2xl border border-gloria-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(13rem,0.8fr)_minmax(20rem,1.2fr)] sm:items-end sm:rounded-3xl"
      aria-busy={isPending}
    >
      <label className="block">
        <span className="mb-1.5 flex items-center gap-2 px-2 text-sm font-extrabold text-gloria-900">
          <SlidersHorizontal className="size-4" />
          1. Elegí tu escuela
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
            navigate(schoolId, "");
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
        <label htmlFor="catalog-search" className="mb-1.5 block px-2 text-sm font-extrabold text-gloria-900">
          2. Buscá una prenda
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="catalog-search"
              name="q"
              defaultValue={searchTerm}
              placeholder="Chomba o remera"
              className="min-h-14 w-full rounded-2xl border border-input bg-white pl-12 pr-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </span>
          <Button type="submit" className="min-h-14 rounded-2xl px-4 text-sm font-bold sm:rounded-full sm:px-6 sm:text-base" disabled={isPending}>
            {isPending ? "Buscando…" : "Buscar"}
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {isPending ? "Mostrando los uniformes…" : "La escuela se filtra automáticamente."}
      </p>
    </form>
  );
}
