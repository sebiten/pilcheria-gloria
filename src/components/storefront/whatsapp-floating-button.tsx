"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/hooks/use-cart";
import { trackStorefrontEvent } from "@/lib/analytics/client";

export function WhatsAppFloatingButton({
  phone,
  storeName,
}: {
  phone?: string | null;
  storeName: string;
}) {
  const pathname = usePathname();
  const isCartOpen = useCartStore((state) => state.isOpen);
  const itemCount = useCartStore((state) =>
    state.items.reduce((count, item) => count + item.quantity, 0)
  );
  const hasMobileCartBar =
    itemCount > 0 && (pathname === "/" || pathname === "/uniformes");
  const isProductDetail = /^\/(uniformes|products)\/[^/]+$/.test(pathname);

  if (!phone || isCartOpen || pathname === "/checkout" || isProductDetail) {
    return null;
  }

  const href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hola, quiero consultar por un uniforme escolar en ${storeName}. Escuela: __. Prenda: __. Talle: __.`
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      onClick={() => trackStorefrontEvent({ event: "whatsapp_click" })}
      className={`fixed right-5 z-50 inline-flex min-h-12 items-center gap-2 rounded-xl border border-emerald-700/20 bg-emerald-600 px-3.5 text-sm font-bold text-white shadow-xl shadow-emerald-950/20 transition-transform hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:px-4 ${
        hasMobileCartBar ? "bottom-24" : "bottom-5"
      }`}
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
