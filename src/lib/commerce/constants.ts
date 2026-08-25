// PostgreSQL mantiene la autoridad económica. Estos valores son validaciones y previews.
export const MAX_QUANTITY_PER_VARIANT = 10;
export const MAX_ITEMS_PER_ORDER = 20;
export const LOCAL_DELIVERY_MIN_ITEMS = 2;
export const MONEY_TOLERANCE = 0.01;
export const ORDER_RESERVATION_MINUTES = 30;
export const PENDING_PAYMENT_EXTENSION_HOURS = 24;

export const ORDER_STATUS_VALUES = [
  "pending",
  "paid",
  "payment_review",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const PAYMENT_PROVIDER_VALUES = [
  "mercadopago",
  "viumi",
  "bank_transfer",
] as const;

export const PAYMENT_ATTEMPT_STATUS_VALUES = [
  "created",
  "pending",
  "in_process",
  "approved",
  "rejected",
  "cancelled",
  "failed",
  "review",
  "refunded",
  "charged_back",
] as const;

export const ACTIVE_PAYMENT_ATTEMPT_STATUSES = [
  "created",
  "pending",
  "in_process",
  "review",
] as const;

export const REFUND_STATUS_VALUES = [
  "none",
  "pending",
  "partial",
  "refunded",
] as const;

export const COUPON_TYPE_VALUES = ["percentage", "fixed"] as const;
export const SIZE_SYSTEM_VALUES = ["infant", "adult"] as const;
export const SCHOOL_LEVEL_VALUES = ["primary", "secondary"] as const;
export const UNIFORM_PRICE_GROUP_CODE_VALUES = ["remera", "chomba"] as const;
export const INVENTORY_SOURCE_TYPE_VALUES = ["own", "partner"] as const;
export const AVAILABILITY_MODE_VALUES = ["finite", "on_demand"] as const;

export const CHECKOUT_INVALIDATION_STATUS_VALUES = [
  "succeeded",
  "failed",
  "not_supported",
] as const;

export const BANK_TRANSFER_REVIEW_RESOLUTION_VALUES = [
  "approved",
  "rejected",
  "expired_stock_released",
  "approved_after_stock_release",
] as const;

export const PROCUREMENT_STATUS_VALUES = [
  "not_required",
  "awaiting_payment",
  "pending_collection",
  "collected",
  "unavailable",
  "cancelled",
] as const;

export const SHIPPING_METHOD_VALUES = ["pickup", "local_delivery"] as const;

export function isOrderStatus(value: string): value is (typeof ORDER_STATUS_VALUES)[number] {
  return ORDER_STATUS_VALUES.some((status) => status === value);
}
