"use client";

import { useEffect, useState } from "react";
import { EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAnalyticsExcluded,
  setAnalyticsExcluded,
} from "@/lib/analytics/client";

export function AnalyticsDeviceControl() {
  const [excluded, setExcluded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setExcluded(isAnalyticsExcluded());
    setReady(true);
  }, []);

  const toggle = () => {
    const nextValue = !excluded;
    setAnalyticsExcluded(nextValue);
    setExcluded(nextValue);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gloria-200 bg-gloria-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold text-gloria-950">
          {excluded
            ? "Este celular o computadora está excluido"
            : "¿Vas a probar la tienda desde este dispositivo?"}
        </p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {excluded
            ? "Tus próximas pruebas no se sumarán a las estadísticas."
            : "Excluilo antes de probar para no mezclar tus visitas con las de clientes."}
        </p>
      </div>
      <Button
        type="button"
        variant={excluded ? "outline" : "default"}
        className="min-h-11 shrink-0 font-bold"
        onClick={toggle}
        disabled={!ready}
      >
        {excluded ? (
          <RotateCcw className="mr-2 size-4" />
        ) : (
          <EyeOff className="mr-2 size-4" />
        )}
        {excluded ? "Volver a medir" : "Excluir este dispositivo"}
      </Button>
    </div>
  );
}
