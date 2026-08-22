"use client";

import type {
  AnalyticsEventDetail,
  AnalyticsDevice,
  ClientAnalyticsEventName,
  AnalyticsSource,
} from "@/lib/analytics/types";
import { ANALYTICS_VERSION } from "@/lib/analytics/types";
import { trackMetaEvent, type MetaEventParameters } from "@/lib/meta/client";

const SESSION_STORAGE_KEY = "gloria-analytics-session";
const SOURCE_STORAGE_KEY = "gloria-analytics-source";
const CAMPAIGN_STORAGE_KEY = "gloria-analytics-campaign";
const MEDIUM_STORAGE_KEY = "gloria-analytics-medium";
const CONTENT_STORAGE_KEY = "gloria-analytics-content";
const LAST_ACTIVITY_STORAGE_KEY = "gloria-analytics-last-activity";
const EXCLUDED_STORAGE_KEY = "gloria-analytics-excluded";
const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
const recentEvents = new Map<string, number>();

function analyticsAllowed() {
  if (typeof window === "undefined" || navigator.doNotTrack === "1") {
    return false;
  }

  try {
    return window.localStorage.getItem(EXCLUDED_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function isAnalyticsExcluded() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXCLUDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsExcluded(excluded: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (excluded) {
      window.localStorage.setItem(EXCLUDED_STORAGE_KEY, "1");
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(SOURCE_STORAGE_KEY);
      window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
      window.localStorage.removeItem(MEDIUM_STORAGE_KEY);
      window.localStorage.removeItem(CONTENT_STORAGE_KEY);
      window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    } else {
      window.localStorage.removeItem(EXCLUDED_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

function isUuid(value: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

export function getAnalyticsSessionId() {
  if (!analyticsAllowed()) return null;

  try {
    const now = Date.now();
    const current = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const lastActivity = Number(
      window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY) || 0
    );

    if (isUuid(current) && now - lastActivity < SESSION_TIMEOUT_MS) {
      window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
      return current;
    }

    const sessionId = crypto.randomUUID();
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    window.localStorage.removeItem(SOURCE_STORAGE_KEY);
    window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
    window.localStorage.removeItem(MEDIUM_STORAGE_KEY);
    window.localStorage.removeItem(CONTENT_STORAGE_KEY);
    return sessionId;
  } catch {
    return null;
  }
}

function getSource(): AnalyticsSource {
  try {
    const taggedSource = new URLSearchParams(window.location.search)
      .get("utm_source")
      ?.toLocaleLowerCase("es-AR");
    if (taggedSource) {
      const explicitSource: AnalyticsSource = taggedSource.includes("whatsapp")
        ? "whatsapp"
        : taggedSource === "fb" || taggedSource.includes("facebook")
          ? "facebook"
          : taggedSource === "ig" || taggedSource.includes("instagram")
            ? "instagram"
            : taggedSource.includes("google")
              ? "google"
              : "other";
      window.localStorage.setItem(SOURCE_STORAGE_KEY, explicitSource);
      return explicitSource;
    }

    const stored = window.localStorage.getItem(SOURCE_STORAGE_KEY);
    if (
      stored === "direct" ||
      stored === "whatsapp" ||
      stored === "facebook" ||
      stored === "instagram" ||
      stored === "google" ||
      stored === "other"
    ) {
      return stored;
    }

    const referrer = document.referrer.toLocaleLowerCase("es-AR");
    const source: AnalyticsSource = referrer.includes("facebook")
        ? "facebook"
        : referrer.includes("instagram")
          ? "instagram"
          : referrer.includes("google")
            ? "google"
            : referrer && !referrer.includes(window.location.host)
              ? "other"
              : "direct";

    window.localStorage.setItem(SOURCE_STORAGE_KEY, source);
    return source;
  } catch {
    return "direct";
  }
}

function getCampaign() {
  try {
    const rawCampaign = new URLSearchParams(window.location.search)
      .get("utm_campaign")
      ?.toLocaleLowerCase("es-AR");
    const campaign = rawCampaign
      ?.normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);

    if (campaign) {
      window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaign);
      return campaign;
    }

    const stored = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    return undefined;
  }

  return undefined;
}

function sanitizeAttribution(value: string | null, maxLength: number) {
  return value
    ?.toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || undefined;
}

function getStoredAttribution(
  storageKey: string,
  queryKey: "utm_medium" | "utm_content",
  maxLength: number
) {
  try {
    const value = sanitizeAttribution(
      new URLSearchParams(window.location.search).get(queryKey),
      maxLength
    );
    if (value) window.localStorage.setItem(storageKey, value);
    if (value) return value;
    return window.localStorage.getItem(storageKey) || undefined;
  } catch {
    return undefined;
  }
}

function getDeviceType(): AnalyticsDevice {
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

type TrackEventInput = {
  event: ClientAnalyticsEventName;
  productId?: string;
  schoolId?: string;
  quantity?: number;
  eventDetail?: AnalyticsEventDetail;
  value?: number;
  contentIds?: string[];
  contentName?: string;
  dedupe?: boolean;
};

function getMetaEventName(event: ClientAnalyticsEventName) {
  if (event === "page_view") return "PageView" as const;
  if (event === "product_view") return "ViewContent" as const;
  if (event === "add_to_cart" || event === "buy_now") return "AddToCart" as const;
  if (event === "checkout_view") return "InitiateCheckout" as const;
  if (event === "checkout_submit") return "AddPaymentInfo" as const;
  return null;
}

export function trackStorefrontEvent({
  event,
  productId,
  schoolId,
  quantity,
  eventDetail,
  value,
  contentIds,
  contentName,
  dedupe = false,
}: TrackEventInput) {
  const sessionId = getAnalyticsSessionId();
  if (!sessionId) return;

  const rawPath = window.location.pathname;
  const path = (
    rawPath.startsWith("/order-confirmation/")
      ? "/order-confirmation"
      : rawPath
          .replace(/^\/account\/orders\/[^/]+$/, "/account/orders/detail")
          .replace(/^\/review\/[^/]+$/, "/review")
  ).slice(0, 200) || "/";
  const signature = `${event}:${path}:${productId ?? ""}:${schoolId ?? ""}`;
  const now = Date.now();

  if (dedupe && now - (recentEvents.get(signature) ?? 0) < 2_000) return;
  if (dedupe) recentEvents.set(signature, now);

  const metaEventName = getMetaEventName(event);
  if (metaEventName) {
    const metaParameters: MetaEventParameters = {
      ...(productId || contentIds?.length
        ? { content_ids: contentIds?.length ? contentIds : [productId!] }
        : {}),
      ...(productId || contentIds?.length ? { content_type: "product" as const } : {}),
      ...(contentName ? { content_name: contentName } : {}),
      ...(Number.isFinite(value) ? { value, currency: "ARS" as const } : {}),
      ...(quantity ? { num_items: quantity } : {}),
    };
    trackMetaEvent({
      eventName: metaEventName,
      parameters: metaParameters,
      analyticsSessionId: sessionId,
    });
  }

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      event,
      path,
      productId,
      schoolId,
      quantity,
      analyticsVersion: ANALYTICS_VERSION,
      campaign: getCampaign(),
      medium: getStoredAttribution(MEDIUM_STORAGE_KEY, "utm_medium", 48),
      content: getStoredAttribution(CONTENT_STORAGE_KEY, "utm_content", 80),
      eventDetail,
      source: getSource(),
      deviceType: getDeviceType(),
    }),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}
