"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Menu,
  ReceiptText,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react";
import { UserButton, useUser } from "@clerk/nextjs";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartStore } from "@/hooks/use-cart";
import { isAdmin } from "@/actions/auth";

const NAV_ITEMS = [
  { href: "/uniformes", label: "Uniformes" },
  { href: "/#escuelas", label: "Escuelas" },
  { href: "/#retiro", label: "Ubicación" },
];

export function Header() {
  const { toggleCart, getItemCount } = useCartStore();
  const itemCount = getItemCount();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isUserAdmin, setIsUserAdmin] = React.useState(false);
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isLoaded || !isSignedIn) {
      setIsUserAdmin(false);
      return;
    }

    void isAdmin()
      .then((admin) => !cancelled && setIsUserAdmin(admin))
      .catch(() => !cancelled && setIsUserAdmin(false));

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-8">
          <Logo />
          <nav
            className="hidden items-center gap-5 lg:flex"
            aria-label="Navegación principal"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-semibold transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <form action="/uniformes" className="relative hidden xl:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              placeholder="Buscar escuela o prenda..."
              aria-label="Buscar escuela o prenda"
              className="w-56 border-transparent bg-muted pl-9 focus-visible:border-primary"
            />
          </form>

          <div className="flex min-w-8 items-center justify-end gap-2 md:min-w-[17rem]">
            {!isLoaded ? (
              <span
                className="h-8 w-8 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : isSignedIn ? (
              <>
                <div className="hidden items-center gap-1 md:flex">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/account/profile">
                      <User className="mr-2 h-4 w-4" />
                      Perfil
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/account/orders">
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Pedidos
                    </Link>
                  </Button>
                  {isUserAdmin ? (
                    <Button size="sm" asChild>
                      <Link href="/dashboard">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Dashboard
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <UserButton />
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                asChild
              >
                <Link href="/login">Ingresar</Link>
              </Button>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="relative min-h-11 min-w-11 border-primary/30"
            onClick={toggleCart}
            aria-label={`Abrir carrito con ${itemCount} productos`}
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.65rem] font-bold text-primary-foreground">
                {itemCount}
              </span>
            ) : null}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 lg:hidden"
            ref={menuButtonRef}
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="menu-principal-movil"
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {isMenuOpen ? (
        <div
          id="menu-principal-movil"
          className="border-t bg-background lg:hidden"
        >
          <div className="mx-auto max-w-[1440px] px-4 py-5">
            <form action="/uniformes" className="relative mb-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" name="q" placeholder="Buscar escuela o prenda..." aria-label="Buscar escuela o prenda" className="min-h-11 pl-9" />
            </form>
            <nav className="grid grid-cols-2 gap-2" aria-label="Navegación móvil">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              {isSignedIn ? (
                <>
                  <Link href="/account/profile" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                    Perfil
                  </Link>
                  <Link href="/account/orders" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                    Mis pedidos
                  </Link>
                  {isUserAdmin ? (
                    <Link href="/dashboard" className="col-span-2 flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground" onClick={() => setIsMenuOpen(false)}>
                      Dashboard
                    </Link>
                  ) : null}
                </>
              ) : (
                <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-muted" onClick={() => setIsMenuOpen(false)}>
                  Ingresar
                </Link>
              )}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
