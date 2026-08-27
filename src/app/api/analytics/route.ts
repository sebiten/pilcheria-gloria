import { NextResponse } from "next/server";
import { z } from "zod";
import { analyticsEventSchema } from "@/lib/analytics/validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 120;

function getFingerprint(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown"
  ).trim();
}

function isRateLimited(fingerprint: string) {
  const now = Date.now();
  const current = attempts.get(fingerprint);

  if (!current || current.resetAt <= now) {
    attempts.set(fingerprint, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 2_000) {
      for (const [key, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(key);
      }
    }
    return false;
  }

  current.count += 1;
  return current.count > MAX_EVENTS_PER_WINDOW;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return new NextResponse(null, { status: 204 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  const fetchSite = request.headers.get("sec-fetch-site");
  const userAgent = request.headers.get("user-agent") || "";

  if (contentLength > 4_096 || fetchSite === "cross-site") {
    return new NextResponse(null, { status: 400 });
  }

  if (/bot|crawler|spider|preview|facebookexternalhit/i.test(userAgent)) {
    return new NextResponse(null, { status: 204 });
  }

  if (isRateLimited(getFingerprint(request))) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    const event = analyticsEventSchema.parse(await request.json());
    const safePath = event.path
      .replace(/^\/order-confirmation\/[^/]+/, "/order-confirmation")
      .replace(/^\/account\/orders\/[^/]+$/, "/account/orders/detail")
      .replace(/^\/review\/[^/]+$/, "/review");
    const { error } = await getSupabaseAdmin()
      .from("storefront_analytics_events")
      .insert({
        session_id: event.sessionId,
        event_name: event.event,
        path: safePath,
        product_id: event.productId ?? null,
        school_id: event.schoolId ?? null,
        source: event.source,
        device_type: event.deviceType,
        quantity: event.quantity ?? null,
        analytics_version: event.analyticsVersion,
        campaign: event.campaign ?? null,
        medium: event.medium ?? null,
        content: event.content ?? null,
        event_detail: event.eventDetail ?? null,
      });

    if (error) throw error;

    return new NextResponse(null, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      console.error("Analytics event error:", error);
    }
    return new NextResponse(null, { status: 400 });
  }
}
