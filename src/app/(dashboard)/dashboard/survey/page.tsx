import type { Metadata } from "next";
import { requireAdmin } from "@/actions/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_INTEREST_OPTIONS, PRODUCT_INTEREST_SURVEY } from "@/lib/product-interest";

export const metadata: Metadata = { title: "Encuesta de prendas" };
export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const results = await Promise.all([
    supabase.from("product_interest_responses").select("id", { count: "exact", head: true }).eq("survey_key", PRODUCT_INTEREST_SURVEY),
    ...PRODUCT_INTEREST_OPTIONS.map((option) =>
      supabase.from("product_interest_responses").select("id", { count: "exact", head: true })
        .eq("survey_key", PRODUCT_INTEREST_SURVEY)
        .or(`first_choice.eq.${option.value},second_choice.eq.${option.value}`)),
  ]);
  if (results.some((result) => result.error)) {
    return <div role="alert" className="rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-bold">Encuesta de prendas</h1>
      <p className="mt-3">No pudimos cargar los resultados. Volvé a intentar en unos minutos.</p>
    </div>;
  }
  const total = results[0].count ?? 0;
  const options = PRODUCT_INTEREST_OPTIONS.map((option, index) => ({
    ...option, votes: results[index + 1].count ?? 0,
  })).sort((a, b) => b.votes - a.votes);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">¿Qué prendas quieren que sumemos?</h1>
        <p className="mt-2 text-muted-foreground">Encuesta del inicio, catálogo y fichas de uniformes.</p>
      </header>
      <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-label="Resultados de la encuesta">
        <p className="text-lg font-semibold">{total.toLocaleString("es-AR")} {total === 1 ? "respuesta recibida" : "respuestas recibidas"}</p>
        <p className="mt-2 text-sm text-muted-foreground">Cada respuesta permite elegir hasta dos prendas. Los porcentajes se calculan sobre las respuestas y pueden sumar más de 100%.</p>
        {total === 0 ? <p className="mt-6 rounded-xl bg-muted p-4 text-sm">Todavía no hay respuestas. Los votos aparecerán acá cuando los visitantes completen la encuesta.</p> : null}
        <ul className="mt-6 space-y-6">
          {options.map((option) => {
            const percentage = total ? Math.round(option.votes / total * 100) : 0;
            return <li key={option.value}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{option.label}</span>
                <span className="text-sm tabular-nums">{option.votes} votos · {percentage}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary" style={{ width: percentage + "%" }} />
              </div>
            </li>;
          })}
        </ul>
      </section>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Se registra una respuesta por identificador de navegador, sin pedir nombre ni contacto.
        Una persona podría responder nuevamente desde otro navegador. Es una señal de interés,
        no una cantidad de ventas aseguradas. Actualizá la página para ver nuevos votos.
      </p>
    </div>
  );
}
