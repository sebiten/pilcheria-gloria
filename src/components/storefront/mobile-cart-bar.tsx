"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { getCartItemCount } from "@/lib/commerce";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/hooks/use-cart";

export function MobileCartBar() {
  const pathname = usePathname();
  const items = useCartStore((state) => state.items);
  const getTotal = useCartStore((state) => state.getTotal);
  const setIsOpen = useCartStore((state) => state.setIsOpen);
  const count = getCartItemCount(items);
  const visibleRoute = pathname === "/" || pathname === "/uniformes";

  if (!visibleRoute || count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gloria-700/20 bg-gloria-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-[0_-18px_45px_-28px_oklch(0.2_0.045_136/0.7)] lg:hidden">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mx-auto flex min-h-12 w-full max-w-md items-center justify-between rounded-xl bg-gloria-400 px-4 font-extrabold text-gloria-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gloria-950"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="size-5" />
          Ver carrito ({count})
        </span>
        <span className="inline-flex items-center gap-2">
          {formatPrice(getTotal())}
          <ArrowRight className="size-4" />
        </span>
      </button>
    </div>
  );
}
