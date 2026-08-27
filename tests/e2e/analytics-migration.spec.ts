import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./helpers/supabase";

const hasDedicatedTestDatabase = Boolean(
  process.env.E2E_SUPABASE_URL &&
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY &&
    process.env.E2E_ALLOW_REMOTE_DB === "1"
);

test.skip(
  !hasDedicatedTestDatabase,
  "Requiere una base Supabase E2E explícita con la migración v7 aplicada"
);

type AnalyticsRpc = {
  comparable_started_at: string | null;
  metrics: {
    checkout_sessions: number;
    checkout_ready_sessions: number;
    checkout_blocked_sessions: number;
    checkout_form_started_sessions: number;
    paid_orders: number;
    revenue: number;
  };
  checkout_blockers: Array<{ detail: string; sessions: number }>;
};

async function getAnalytics() {
  const { data, error } = await getSupabaseAdmin().rpc(
    "get_storefront_analytics",
    { p_days: 365 }
  );
  if (error) throw error;
  return data as AnalyticsRpc;
}

function blockerSessions(data: AnalyticsRpc, detail: string) {
  return data.checkout_blockers.find((item) => item.detail === detail)?.sessions ?? 0;
}

test("la migración v7 conserva v6, valida detalles y agrega métricas por sesión", async () => {
  const supabase = getSupabaseAdmin();
  const historicalSession = randomUUID();
  const recoveredSession = randomUUID();
  const blockedSession = randomUUID();
  const sessionIds = [historicalSession, recoveredSession, blockedSession];
  const before = await getAnalytics();
  const v7CreatedAt = new Date().toISOString();

  try {
    const { error: validInsertError } = await supabase
      .from("storefront_analytics_events")
      .insert([
        {
          session_id: historicalSession,
          event_name: "checkout_view",
          path: "/checkout",
          source: "direct",
          device_type: "mobile",
          analytics_version: 6,
          created_at: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          session_id: historicalSession,
          event_name: "checkout_validation_error",
          event_detail: null,
          path: "/checkout",
          source: "direct",
          device_type: "mobile",
          analytics_version: 6,
          created_at: new Date(Date.now() - 59_000).toISOString(),
        },
        ...[
          [recoveredSession, "checkout_view", null],
          [recoveredSession, "checkout_blocked", "cart_refresh_failed"],
          [recoveredSession, "checkout_ready", null],
          [recoveredSession, "checkout_form_started", null],
          [blockedSession, "checkout_view", null],
          [blockedSession, "checkout_blocked", "no_payment_provider"],
        ].map(([sessionId, eventName, eventDetail], index) => ({
          session_id: sessionId,
          event_name: eventName,
          event_detail: eventDetail,
          path: "/checkout",
          source: "direct",
          device_type: "mobile",
          analytics_version: 7,
          created_at: new Date(Date.parse(v7CreatedAt) + index).toISOString(),
        })),
      ]);
    expect(validInsertError).toBeNull();

    for (const invalidEvent of [
      { event_name: "checkout_blocked", event_detail: null },
      { event_name: "checkout_blocked", event_detail: "missing_name" },
      {
        event_name: "checkout_validation_error",
        event_detail: "cart_refresh_failed",
      },
      { event_name: "checkout_ready", event_detail: "no_shipping_method" },
      {
        event_name: "checkout_form_started",
        event_detail: "invalid_phone",
      },
    ]) {
      const { error } = await supabase.from("storefront_analytics_events").insert({
        session_id: randomUUID(),
        path: "/checkout",
        source: "direct",
        device_type: "mobile",
        analytics_version: 7,
        ...invalidEvent,
      });
      expect(error).not.toBeNull();
    }

    const after = await getAnalytics();
    expect(after.metrics.checkout_sessions - before.metrics.checkout_sessions).toBe(2);
    expect(
      after.metrics.checkout_ready_sessions - before.metrics.checkout_ready_sessions
    ).toBe(1);
    expect(
      after.metrics.checkout_blocked_sessions - before.metrics.checkout_blocked_sessions
    ).toBe(2);
    expect(
      after.metrics.checkout_form_started_sessions -
        before.metrics.checkout_form_started_sessions
    ).toBe(1);
    expect(
      blockerSessions(after, "cart_refresh_failed") -
        blockerSessions(before, "cart_refresh_failed")
    ).toBe(1);
    expect(
      blockerSessions(after, "no_payment_provider") -
        blockerSessions(before, "no_payment_provider")
    ).toBe(1);
    expect(after.metrics.paid_orders).toBe(before.metrics.paid_orders);
    expect(after.metrics.revenue).toBe(before.metrics.revenue);

    if (before.comparable_started_at) {
      expect(after.comparable_started_at).toBe(before.comparable_started_at);
    } else {
      expect(after.comparable_started_at).not.toBeNull();
      expect(Date.parse(after.comparable_started_at!)).toBeGreaterThanOrEqual(
        Date.parse(v7CreatedAt)
      );
    }
  } finally {
    await supabase
      .from("storefront_analytics_events")
      .delete()
      .in("session_id", sessionIds);
  }
});
