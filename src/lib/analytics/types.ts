export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "product_view",
  "add_to_cart",
  "checkout_view",
  "checkout_submit",
  "select_school",
  "catalog_search",
  "whatsapp_click",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsSource =
  | "direct"
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "google"
  | "other";
export type AnalyticsDevice = "mobile" | "tablet" | "desktop";

export type AnalyticsDashboardData = {
  period_days: number;
  tracking_started_at: string | null;
  last_event_at: string | null;
  metrics: {
    visitors: number;
    page_views: number;
    product_viewers: number;
    cart_sessions: number;
    checkout_sessions: number;
    checkout_submits: number;
    purchasing_sessions: number;
    paid_orders: number;
    revenue: number;
    product_without_cart: number;
    cart_without_checkout: number;
    checkout_without_purchase: number;
    whatsapp_sessions: number;
  };
  daily: Array<{
    date: string;
    visitors: number;
    product_viewers: number;
    carts: number;
    checkouts: number;
    purchases: number;
    revenue: number;
  }>;
  top_products: Array<{
    product_id: string;
    name: string;
    slug: string;
    views: number;
    cart_adds: number;
  }>;
  top_schools: Array<{
    school_id: string;
    selections: number;
  }>;
  sources: Array<{
    source: AnalyticsSource;
    sessions: number;
  }>;
  devices: Array<{
    device_type: AnalyticsDevice;
    sessions: number;
  }>;
};
