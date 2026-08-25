"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import {
  mergeCartItems,
  refreshCheckoutCart,
  replaceCartItems,
} from "@/actions/cart";
import {
  cartNeedsPriceRefresh,
  markCartPricingFresh,
  useCartStore,
} from "@/hooks/use-cart";
import type { CartItem } from "@/types";

const SYNC_DEBOUNCE_MS = 500;

function toSyncPayload(items: CartItem[]) {
  return items.map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
  }));
}

export function CartSync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const items = useCartStore((state) => state.items);
  const setItems = useCartStore((state) => state.setItems);
  const syncedUserIdRef = React.useRef<string | null>(null);
  const skipNextReplaceRef = React.useRef(false);
  const pricingRefreshStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (
      pricingRefreshStartedRef.current ||
      items.length === 0 ||
      !cartNeedsPriceRefresh()
    ) {
      return;
    }

    pricingRefreshStartedRef.current = true;
    void refreshCheckoutCart(toSyncPayload(items))
      .then((refreshedItems) => {
        markCartPricingFresh();
        setItems(refreshedItems);
      })
      .catch((error) => {
        pricingRefreshStartedRef.current = false;
        console.error("No se pudieron actualizar los precios del carrito:", error);
      });
  }, [items, setItems]);

  React.useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn || !user?.id) {
      syncedUserIdRef.current = null;
      skipNextReplaceRef.current = false;
      return;
    }

    if (syncedUserIdRef.current === user.id) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const mergedItems = await mergeCartItems(toSyncPayload(useCartStore.getState().items));
        if (cancelled) {
          return;
        }

        skipNextReplaceRef.current = true;
        syncedUserIdRef.current = user.id;
        markCartPricingFresh();
        setItems(mergedItems);
      } catch (error) {
        console.error("Error sincronizando carrito al iniciar sesión:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, setItems, user?.id]);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    if (syncedUserIdRef.current !== user.id) {
      return;
    }

    if (skipNextReplaceRef.current) {
      skipNextReplaceRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void replaceCartItems(toSyncPayload(items)).catch((error) => {
        console.error("Error persistiendo carrito:", error);
      });
    }, SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoaded, isSignedIn, items, user?.id]);

  return null;
}
