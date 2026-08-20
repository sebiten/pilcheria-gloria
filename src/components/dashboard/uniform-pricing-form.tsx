"use client";

import { useState, useTransition } from "react";
import { updateUniformPrices } from "@/actions/uniform-pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";

export function UniformPricingForm({
  remeraPrice,
  chombaPrice,
}: {
  remeraPrice: number;
  chombaPrice: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [prices, setPrices] = useState({ remeraPrice, chombaPrice });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await updateUniformPrices(prices);
        setSuccess(
          `Precios actualizados: remeras ${formatPrice(prices.remeraPrice)} y chombas ${formatPrice(prices.chombaPrice)}.`
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudieron actualizar los precios"
        );
      }
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <PriceField
          id="remeraPrice"
          label="Todas las remeras"
          value={prices.remeraPrice}
          onChange={(value) =>
            setPrices((current) => ({ ...current, remeraPrice: value }))
          }
        />
        <PriceField
          id="chombaPrice"
          label="Todas las chombas"
          value={prices.chombaPrice}
          onChange={(value) =>
            setPrices((current) => ({ ...current, chombaPrice: value }))
          }
        />
      </div>

      <div className="rounded-xl bg-gloria-50 p-4 text-sm leading-6 text-gloria-900">
        <p className="font-bold">Cómo se distribuye una venta del negocio</p>
        <p>
          Remera: vos {formatPrice(prices.remeraPrice * 0.2)} · tu abuela{" "}
          {formatPrice(prices.remeraPrice * 0.8)}
        </p>
        <p>
          Chomba: vos {formatPrice(prices.chombaPrice * 0.2)} · tu abuela{" "}
          {formatPrice(prices.chombaPrice * 0.8)}
        </p>
        <p className="mt-2 text-muted-foreground">
          Si la unidad es de tu stock, el importe completo queda para vos.
        </p>
      </div>

      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      {success ? <p role="status" className="text-sm font-semibold text-green-700">{success}</p> : null}

      <Button className="min-h-12 w-full sm:w-auto" type="submit" disabled={isPending}>
        {isPending ? "Actualizando…" : "Guardar los dos precios"}
      </Button>
    </form>
  );
}

function PriceField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <Label htmlFor={id} className="text-base font-extrabold">
        {label}
      </Label>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xl font-black">$</span>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min="1000"
          max="1000000"
          step="1000"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-12 text-lg font-bold"
          required
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Mismo precio para todos los talles y escuelas.
      </p>
    </div>
  );
}
