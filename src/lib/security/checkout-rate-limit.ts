import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHECKOUTS_PER_WINDOW = 8;
const MAX_REQUESTS_PER_MINUTE = 12;
const MAX_LOCAL_FINGERPRINTS = 5_000;

type LocalAttempt = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  checkoutAttempts?: Map<string, LocalAttempt>;
};

const localAttempts =
  globalRateLimit.checkoutAttempts ?? new Map<string, LocalAttempt>();
globalRateLimit.checkoutAttempts = localAttempts;

export class CheckoutRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Demasiados intentos de compra. Esperá unos minutos y volvé a intentar.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getClientIp(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip");

  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function consumeLocalLimit(fingerprint: string) {
  const now = Date.now();

  if (localAttempts.size >= MAX_LOCAL_FINGERPRINTS) {
    for (const [key, attempt] of localAttempts) {
      if (attempt.resetAt <= now) localAttempts.delete(key);
    }

    while (localAttempts.size >= MAX_LOCAL_FINGERPRINTS) {
      const oldestKey = localAttempts.keys().next().value;
      if (!oldestKey) break;
      localAttempts.delete(oldestKey);
    }
  }

  const current = localAttempts.get(fingerprint);

  if (!current || current.resetAt <= now) {
    localAttempts.set(fingerprint, {
      count: 1,
      resetAt: now + 60_000,
    });
    return;
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_MINUTE) {
    throw new CheckoutRateLimitError(
      Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    );
  }
}

export async function enforceCheckoutRateLimit(request: Request) {
  const secret =
    process.env.CHECKOUT_RATE_LIMIT_SECRET ||
    process.env.CRON_SECRET ||
    "checkout-local";
  const fingerprint = createHash("sha256")
    .update(`${secret}:${getClientIp(request)}`)
    .digest("hex");

  consumeLocalLimit(fingerprint);

  const supabase = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart)
    .eq("shipping_address->>_checkout_fingerprint", fingerprint);

  if (error) {
    console.error("No se pudo verificar el límite distribuido del checkout:", error);
    throw new CheckoutRateLimitError(60);
  } else if ((count ?? 0) >= MAX_CHECKOUTS_PER_WINDOW) {
    throw new CheckoutRateLimitError(Math.ceil(WINDOW_MS / 1000));
  }

  return fingerprint;
}
