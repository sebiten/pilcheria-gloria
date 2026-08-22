"use client";

export type MetaBrowserEventName =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo";

export type MetaEventParameters = {
  content_ids?: string[];
  content_type?: "product";
  content_name?: string;
  currency?: "ARS";
  value?: number;
  num_items?: number;
};

type QueuedMetaEvent = {
  eventName: MetaBrowserEventName;
  parameters: MetaEventParameters;
  eventId: string;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    __gloriaMetaQueue?: QueuedMetaEvent[];
  }
}

function metaTrackingAllowed() {
  if (
    typeof window === "undefined" ||
    !process.env.NEXT_PUBLIC_META_PIXEL_ID ||
    navigator.doNotTrack === "1"
  ) {
    return false;
  }

  try {
    return window.localStorage.getItem("gloria-analytics-excluded") !== "1";
  } catch {
    return false;
  }
}

function sendBrowserEvent(event: QueuedMetaEvent) {
  if (!window.fbq) return false;
  window.fbq("track", event.eventName, event.parameters, {
    eventID: event.eventId,
  });
  return true;
}

export function flushMetaEventQueue() {
  if (typeof window === "undefined" || !window.fbq) return;
  const queue = window.__gloriaMetaQueue ?? [];
  window.__gloriaMetaQueue = [];
  queue.forEach(sendBrowserEvent);
}

export function trackMetaEvent({
  eventName,
  parameters = {},
  analyticsSessionId,
}: {
  eventName: MetaBrowserEventName;
  parameters?: MetaEventParameters;
  analyticsSessionId: string;
}) {
  if (!metaTrackingAllowed()) return;

  const event: QueuedMetaEvent = {
    eventName,
    parameters,
    eventId: crypto.randomUUID(),
  };

  if (!sendBrowserEvent(event)) {
    window.__gloriaMetaQueue ??= [];
    window.__gloriaMetaQueue.push(event);
  }

  void fetch("/api/meta/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...event,
      analyticsSessionId,
      path: window.location.pathname,
    }),
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}
