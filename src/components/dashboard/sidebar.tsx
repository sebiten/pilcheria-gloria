"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  FolderTree,
  HandCoins,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Tags,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { AdminNotificationCenter } from "@/components/dashboard/notification-center";
import type { AdminNotificationState } from "@/actions/admin-notifications";

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

function DashboardNavigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Administración
      </p>
      <ul className="space-y-1">
        {sidebarItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StoreLink() {
  return (
    <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Button variant="outline" className="min-h-11 w-full justify-start gap-3" asChild>
        <Link href="/">
          <LayoutDashboard className="size-5" />
          Ver tienda
        </Link>
      </Button>
    </div>
  );
}

export function DashboardSidebar({
  initialNotificationState,
}: {
  initialNotificationState: AdminNotificationState;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return (
    <>
      <div className="fixed right-[4.75rem] top-2.5 z-[60] lg:left-[12.75rem] lg:right-auto lg:top-[1.125rem]">
        <AdminNotificationCenter initialState={initialNotificationState} />
      </div>
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-card lg:hidden">
        <div className="flex h-16 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
          <Logo href="/dashboard" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            aria-label="Abrir menú de administración"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-50 bg-foreground/35 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!mobileOpen}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r bg-card shadow-2xl transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-hidden={!mobileOpen}
        aria-label="Navegación de administración"
        aria-modal={mobileOpen}
        inert={!mobileOpen}
        role="dialog"
      >
        <div className="flex min-h-16 items-center justify-between border-b px-4 pt-[env(safe-area-inset-top)]">
          <Logo href="/dashboard" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Cerrar menú de administración"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-5" />
          </Button>
        </div>
        <DashboardNavigation
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />
        <StoreLink />
      </aside>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex min-h-20 items-center border-b px-4">
          <Logo href="/dashboard" />
        </div>
        <DashboardNavigation pathname={pathname} />
        <StoreLink />
      </aside>
    </>
  );
}
