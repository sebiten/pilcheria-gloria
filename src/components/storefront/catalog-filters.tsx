"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchoolUniformFilter } from "@/lib/school-uniforms";

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
    navigate(String(data.get("school") ?? ""), String(data.get("q") ?? ""));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-3xl border border-gloria-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(13rem,0.8fr)_minmax(18rem,1.2fr)_auto] sm:items-end"
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
          onChange={(event) => navigate(event.target.value, "")}
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

      <label className="relative block">
        <span className="mb-1.5 block px-2 text-sm font-extrabold text-gloria-900">
          2. Buscá una prenda
        </span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={searchTerm}
            placeholder="Ej.: chomba o remera"
            className="min-h-14 w-full rounded-2xl border border-input bg-white pl-12 pr-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </span>
      </label>

      <Button type="submit" className="min-h-14 rounded-full px-6 text-base font-bold" disabled={isPending}>
        {isPending ? "Buscando…" : "Buscar"}
      </Button>

      <p className="px-2 text-xs font-semibold text-muted-foreground sm:col-span-3" aria-live="polite">
        {isPending ? "Mostrando los uniformes…" : "Al elegir una escuela, sus prendas aparecen automáticamente."}
      </p>
    </form>
  );
}
