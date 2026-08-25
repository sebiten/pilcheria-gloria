import type { OrderStatus } from "@/types";

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["pending", "cancelled"],
  paid: ["paid", "ready_for_pickup", "shipped", "cancelled"],
  payment_review: ["payment_review", "cancelled"],
  ready_for_pickup: ["ready_for_pickup", "delivered", "cancelled"],
  shipped: ["shipped", "delivered", "cancelled"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

export function getAllowedOrderStatusTransitions(
  status: OrderStatus,
  shippingMethod?: string | null
) {
  if (status !== "paid") {
    return ORDER_STATUS_TRANSITIONS[status];
  }

  return [
    "paid",
    shippingMethod === "local_delivery" ? "shipped" : "ready_for_pickup",
    "cancelled",
  ] satisfies OrderStatus[];
}
