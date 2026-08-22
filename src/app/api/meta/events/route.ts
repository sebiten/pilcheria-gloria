import { NextResponse } from "next/server";
import { z } from "zod";
import { hashMetaExternalId, sendMetaConversion } from "@/lib/meta/conversions";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";

const schema = z.object({
  eventName: z.enum([
    "PageView",
    "ViewContent",
    "AddToCart",
    "InitiateCheckout",
    "AddPaymentInfo",
  ]),
  eventId: z.string().uuid(),
  analyticsSessionId: z.string().uuid(),
  path: z.string().startsWith("/").max(200).regex(/^\/(?!\/)/),
  parameters: z.object({
    content_ids: z.array(z.string().uuid()).max(20).optional(),
    content_type: z.literal("product").optional(),
    content_name: z.string().trim().max(120).optional(),
    currency: z.literal("ARS").optional(),
    value: z.number().finite().min(0).max(10_000_000).optional(),
    num_items: z.number().int().min(1).max(20).optional(),
  }),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 60;

function getClientIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    ""
  ).trim();
}

function isRateLimited(fingerprint: string) {
  const now = Date.now();
  const current = attempts.get(fingerprint);
  if (!current || current.resetAt <= now) {
    attempts.set(fingerprint, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_EVENTS_PER_WINDOW;
}

function parseCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => Boolean(key && value))
  );
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return new NextResponse(null, { status: 204 });
  }

  if (
    Number(request.headers.get("content-length") || 0) > 8_192 ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    isRateLimited(getClientIp(request) || "unknown")
  ) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const event = schema.parse(await request.json());
    const cookies = parseCookies(request);
    await sendMetaConversion({
      eventName: event.eventName,
      eventId: event.eventId,
      eventSourceUrl: `${getSiteUrl()}${event.path}`,
      userData: {
        external_id: [hashMetaExternalId(event.analyticsSessionId)],
        ...(getClientIp(request)
          ? { client_ip_address: getClientIp(request) }
          : {}),
        ...(request.headers.get("user-agent")
          ? { client_user_agent: request.headers.get("user-agent")! }
          : {}),
        ...(cookies._fbp ? { fbp: decodeURIComponent(cookies._fbp) } : {}),
        ...(cookies._fbc ? { fbc: decodeURIComponent(cookies._fbc) } : {}),
      },
      customData: event.parameters,
    });

    return new NextResponse(null, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      console.error("Meta CAPI event error:", error);
    }
    return new NextResponse(null, { status: 400 });
  }
}
