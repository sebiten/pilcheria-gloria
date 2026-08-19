"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowRight, School } from "lucide-react";
import type { SchoolUniformFilter } from "@/lib/school-uniforms";
import { trackStorefrontEvent } from "@/lib/analytics/client";

export function HeroSchoolPicker({
  schools,
}: {
  schools: SchoolUniformFilter[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-2xl border border-gloria-300 bg-white/92 p-3 shadow-[0_16px_36px_-28px_oklch(0.2_0.045_136/0.55)] lg:hidden">
      <label htmlFor="home-school" className="flex items-center gap-2 text-sm font-extrabold text-gloria-950">
        <School className="size-4 text-gloria-700" />
        ¿De qué escuela necesitás el uniforme?
      </label>
      <select
        id="home-school"
        defaultValue=""
        disabled={isPending}
        onChange={(event) => {
          const schoolId = event.target.value;
          if (!schoolId) return;
          trackStorefrontEvent({ event: "select_school", schoolId });
          startTransition(() => {
            router.push(`/uniformes?school=${encodeURIComponent(schoolId)}`);
          });
        }}
        className="mt-2 min-h-14 w-full rounded-xl border border-gloria-300 bg-gloria-50 px-4 text-base font-bold text-gloria-950 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">{isPending ? "Abriendo…" : "Elegí una escuela"}</option>
        {schools.map((school) => (
          <option key={school.id} value={school.id}>
            {school.name}
          </option>
        ))}
      </select>
      <Link
        href="/uniformes"
        className="mt-2 flex min-h-11 items-center justify-between rounded-lg px-2 text-sm font-bold text-gloria-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Ver todos los uniformes
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
