import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ANALYTICS_EVENT_DETAILS,
  ANALYTICS_VERSION,
  CLIENT_ANALYTICS_EVENT_NAMES,
} from "@/lib/analytics/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const analyticsEventSchema = z.object({
  sessionId: z.string().uuid(),
  event: z.enum(CLIENT_ANALYTICS_EVENT_NAMES),
  path: z.string().trim().startsWith("/").max(200),
  productId: z.string().uuid().optional(),
  schoolId: z.string().trim().max(80).regex(/^[a-z0-9-]+$/).optional(),
  source: z.enum(["direct", "whatsapp", "facebook", "instagram", "google", "other"]),
  deviceType: z.enum(["mobile", "tablet", "desktop"]),
  quantity: z.number().int().min(1).max(20).optional(),
  analyticsVersion: z.literal(ANALYTICS_VERSION),
  campaign: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  medium: z
    .string()
    .trim()
    .max(48)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  content: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  eventDetail: z.enum(ANALYTICS_EVENT_DETAILS).optional(),
}).superRefine((event, context) => {
  if (event.eventDetail && event.event !== "checkout_validation_error") {
    context.addIssue({
      code: "custom",
      message: "El detalle solo corresponde a errores del checkout",
      path: ["eventDetail"],
    });
  }
});

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
