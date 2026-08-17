import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-gloria-700">
        404
      </p>
      <h1 className="mb-3 font-display text-4xl text-gloria-950">
        Página no encontrada
      </h1>
      <p className="mb-8 text-muted-foreground">
        La ruta que buscaste no existe o ya no está disponible.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/uniformes">Ver uniformes</Link>
        </Button>
      </div>
    </div>
  );
}
