"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section
      className="grid min-h-[60vh] place-items-center text-center"
      role="alert"
    >
      <div className="max-w-md rounded-2xl border bg-card p-7 shadow-sm">
        <h1 className="text-2xl font-black">No pudimos cargar el panel</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No se modificó ningún dato. Reintentá la consulta.
        </p>
        <Button className="mt-6 min-h-11 w-full" onClick={unstable_retry}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
