import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export async function getAnalyticsDashboard(days: number) {
  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const supabase = getSupabaseAdmin();
  const [dashboardResult, attributionResult] = await Promise.all([
    supabase.rpc("get_storefront_analytics", { p_days: safeDays }),
    supabase.rpc("get_marketing_attribution", { p_days: safeDays }),
  ]);

  if (dashboardResult.error) throw dashboardResult.error;
  if (attributionResult.error) throw attributionResult.error;

  const dashboard = dashboardResult.data as AnalyticsDashboardData;

  return {
    ...dashboard,
    metrics: {
      ...dashboard.metrics,
      payment_rejected_sessions:
        dashboard.metrics.payment_rejected_sessions ?? 0,
      payment_pending_sessions:
        dashboard.metrics.payment_pending_sessions ?? 0,
      checkout_ready_sessions:
        dashboard.metrics.checkout_ready_sessions ?? 0,
      checkout_blocked_sessions:
        dashboard.metrics.checkout_blocked_sessions ?? 0,
      checkout_form_started_sessions:
        dashboard.metrics.checkout_form_started_sessions ?? 0,
    },
    checkout_blockers: dashboard.checkout_blockers ?? [],
    payment_rejection_reasons: dashboard.payment_rejection_reasons ?? [],
    campaigns: attributionResult.data ?? [],
  } as AnalyticsDashboardData;
}
