import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRODUCT_INTEREST_SURVEY } from "@/lib/product-interest";
import { productInterestSchema } from "@/lib/product-interest-validation";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(request: Request) {
  const now = Date.now();
  const ip = (request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const key = createHash("sha256").update(ip).digest("hex");
  const current = attempts.get(key);
  if (current && current.resetAt > now) {
    current.count += 1;
    return current.count > 10;
  }
  if (attempts.size >= 2000) {
    for (const [id, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(id);
    }
    if (attempts.size >= 2000) return true;
  }
  attempts.set(key, { count: 1, resetAt: now + 60_000 });
  return false;
}

export async function POST(request: Request) {
  const respond = (body: object, status: number) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)) {
    return respond({ error: "Solicitud no permitida." }, 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return respond({ error: "Formato no válido." }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) {
    return respond({ error: "Solicitud demasiado grande." }, 413);
  }
  if (isRateLimited(request)) {
    return respond({ error: "Esperá un minuto antes de volver a intentar." }, 429);
  }

  let input;
  try {
    const body = await request.text();
    if (body.length > 2048) return respond({ error: "Solicitud demasiado grande." }, 413);
    const result = productInterestSchema.safeParse(JSON.parse(body));
    if (!result.success) return respond({ error: "Elegí una o dos prendas diferentes." }, 400);
    input = result.data;
  } catch {
    return respond({ error: "No pudimos leer la respuesta." }, 400);
  }

  try {
    const { error } = await getSupabaseAdmin().from("product_interest_responses").insert({
      survey_key: PRODUCT_INTEREST_SURVEY,
      visitor_id: input.visitorId,
      first_choice: input.choices[0],
      second_choice: input.choices[1] ?? null,
      placement: input.placement,
    });
    // A retry after a lost response must not count as a new vote.
    if (error && error.code !== "23505") throw error;
    return respond({ saved: true }, 200);
  } catch (error) {
    console.error("No se pudo guardar la encuesta de prendas:", error);
    return respond({ error: "No pudimos guardar tu respuesta. Volvé a intentar." }, 503);
  }
}
