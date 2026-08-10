"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/storefront/header";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartContent } from "@/components/storefront/cart-content";
import { CartSync } from "@/components/storefront/cart-sync";
import { hydrateCartStore, subscribeCartStorePersistence, useCartStore } from "@/hooks/use-cart";

export function StorefrontClientShell() {
  const pathname = usePathname();
  const isOpen = useCartStore((state) => state.isOpen);
  const setIsOpen = useCartStore((state) => state.setIsOpen);

  React.useEffect(() => {
    hydrateCartStore();
    return subscribeCartStorePersistence();
  }, []);

  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname, setIsOpen]);

  return (
    <>
      <CartSync />
      <Header />
      <CartDrawer isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <CartContent />
      </CartDrawer>
    </>
  );
}
