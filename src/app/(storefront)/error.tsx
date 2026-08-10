"use client";

import { Button } from "@/components/ui/button";

export default function StorefrontError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section
      className="container mx-auto grid min-h-[55vh] place-items-center px-4 py-16 text-center"
      role="alert"
    >
      <div className="max-w-md rounded-3xl border bg-card p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Hubo un problema
        </p>
        <h1 className="mt-3 text-2xl font-black">No pudimos cargar esta parte</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tus datos y tu carrito siguen guardados. Probá nuevamente en unos
          segundos.
        </p>
        <Button className="mt-6 min-h-11 w-full" onClick={unstable_retry}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
