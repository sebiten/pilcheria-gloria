import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <span className="sm:hidden">
          <Logo compact />
        </span>
        <span className="hidden sm:block">
          <Logo />
        </span>
        <Link
          href="/cart"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-gloria-900 transition-colors hover:bg-gloria-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al carrito
        </Link>
      </div>
    </header>
  );
}
