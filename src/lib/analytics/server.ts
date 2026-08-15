import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AnalyticsDashboardData } from "@/lib/analytics/types";

export async function getAnalyticsDashboard(days: number) {
  const safeDays = [7, 30, 90].includes(days) ? days : 30;
  const { data, error } = await getSupabaseAdmin().rpc(
    "get_storefront_analytics",
    { p_days: safeDays }
  );

  if (error) throw error;
  return data as AnalyticsDashboardData;
}
