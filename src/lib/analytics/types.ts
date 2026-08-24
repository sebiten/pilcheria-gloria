export const ANALYTICS_VERSION = 6;

export const CLIENT_ANALYTICS_EVENT_NAMES = [
  "page_view",
  "catalog_view",
  "product_view",
  "select_design",
  "select_size",
  "add_to_cart",
  "buy_now",
  "checkout_view",
  "checkout_cta_click",
  "checkout_validation_error",
  "checkout_submit",
  "payment_redirect",
  "confirmation_view",
  "select_school",
  "catalog_search",
  "whatsapp_click",
] as const;

export const SERVER_ANALYTICS_EVENT_NAMES = [
  "payment_approved",
  "payment_rejected",
  "payment_pending",
  "purchase",
] as const;

export const ANALYTICS_EVENT_NAMES = [
  ...CLIENT_ANALYTICS_EVENT_NAMES,
  ...SERVER_ANALYTICS_EVENT_NAMES,
] as const;

export const ANALYTICS_EVENT_DETAILS = [
  "missing_name",
  "invalid_email",
  "invalid_phone",
  "shipping_unavailable",
  "missing_address",
  "coupon_pending",
  "api_client_error",
  "api_server_error",
  "missing_payment_link",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type ClientAnalyticsEventName =
  (typeof CLIENT_ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsEventDetail = (typeof ANALYTICS_EVENT_DETAILS)[number];
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
  comparable_started_at: string | null;
  last_event_at: string | null;
  comparable_sessions: number;
  sample_warning: boolean;
  metrics: {
    visitors: number;
    catalog_sessions: number;
    page_views: number;
    product_viewers: number;
    size_selection_sessions: number;
    purchase_intent_sessions: number;
    buy_now_sessions: number;
    cart_sessions: number;
    checkout_sessions: number;
    checkout_cta_sessions: number;
    checkout_submits: number;
    payment_redirect_sessions: number;
    payment_approved_sessions: number;
    payment_rejected_sessions: number;
    payment_pending_sessions: number;
    confirmation_sessions: number;
    purchasing_sessions: number;
    paid_orders: number;
    revenue: number;
    product_without_cart: number;
    cart_without_checkout: number;
    checkout_without_purchase: number;
    whatsapp_sessions: number;
  };
  checkout_errors: Array<{
    detail: AnalyticsEventDetail;
    sessions: number;
  }>;
  payment_rejection_reasons: Array<{
    category: "data" | "issuer" | "risk" | "other";
    detail: string;
    payments: number;
    sessions: number;
  }>;
  campaigns: Array<{
    campaign: string;
    medium: string | null;
    content: string | null;
    catalog_sessions: number;
    product_viewers: number;
    size_selections: number;
    purchase_intents: number;
    checkout_sessions: number;
    payment_redirects: number;
    payment_approved: number;
    revenue: number;
  }>;
  daily: Array<{
    date: string;
    visitors: number;
    product_viewers: number;
    size_selections: number;
    purchase_intents: number;
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
    size_selections: number;
    purchase_intents: number;
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
