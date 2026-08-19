"use client";

import { useEffect } from "react";
import { useCartStore } from "@/hooks/use-cart";
import { trackStorefrontEvent } from "@/lib/analytics/client";

export function ClearCartOnMount() {
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    clearCart();
    trackStorefrontEvent({ event: "confirmation_view", dedupe: true });
  }, [clearCart]);

  return null;
}
