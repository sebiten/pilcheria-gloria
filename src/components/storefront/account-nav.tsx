"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ACCOUNT_NAV_ITEMS = [
  { href: "/account/profile", label: "Perfil" },
  { href: "/account/orders", label: "Pedidos" },
  { href: "/account/addresses", label: "Direcciones" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-4" aria-label="Mi cuenta">
      {ACCOUNT_NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-bold transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "border hover:bg-accent"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
