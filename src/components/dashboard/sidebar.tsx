"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Tags,
  FolderTree,
  Settings,
  Star,
  BadgeCheck,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

const sidebarItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/products", icon: Package, label: "Productos" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Órdenes" },
  { href: "/dashboard/finance", icon: HandCoins, label: "Inventario y saldos" },
  { href: "/dashboard/categories", icon: FolderTree, label: "Categorías" },
  { href: "/dashboard/brands", icon: BadgeCheck, label: "Marcas" },
  { href: "/dashboard/coupons", icon: Tags, label: "Cupones" },
  { href: "/dashboard/reviews", icon: Star, label: "Reseñas" },
  { href: "/dashboard/settings", icon: Settings, label: "Configuración" },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Logo href="/dashboard" />
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {sidebarItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                    isActive ? "bg-accent" : "transparent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-4">
        <Button variant="outline" className="w-full justify-start gap-3" asChild>
          <Link href="/">
            <LayoutDashboard className="h-4 w-4" />
            Ver tienda
          </Link>
        </Button>
      </div>
    </aside>
  );
}
