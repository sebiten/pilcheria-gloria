"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PRODUCT_INTEREST_OPTIONS,
  PRODUCT_INTEREST_STORAGE,
  toggleProductInterest,
  type ProductInterestChoice,
  type ProductInterestPlacement,
} from "@/lib/product-interest";

let memoryVisitorId: string | undefined;
let memoryCompleted = false;
let memoryDismissedUntil = 0;

function readPreference() {
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCT_INTEREST_STORAGE) || "{}");
    return {
      completed: stored.completed === true || memoryCompleted,
      dismissedUntil: Math.max(Number(stored.dismissedUntil) || 0, memoryDismissedUntil),
    };
  } catch {
    return { completed: memoryCompleted, dismissedUntil: memoryDismissedUntil };
  }
}

function remember(value: { completed?: boolean; dismissedUntil?: number }) {
  if (value.completed) memoryCompleted = true;
  if (value.dismissedUntil) memoryDismissedUntil = value.dismissedUntil;
  try {
    localStorage.setItem(PRODUCT_INTEREST_STORAGE, JSON.stringify(value));
  } catch { /* The survey also works when browser storage is unavailable. */ }
}

function getVisitorId() {
  try {
    const key = PRODUCT_INTEREST_STORAGE + ":visitor";
    const stored = localStorage.getItem(key);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    memoryVisitorId ??= crypto.randomUUID();
    localStorage.setItem(key, memoryVisitorId);
    return memoryVisitorId;
  } catch {
    memoryVisitorId ??= crypto.randomUUID();
    return memoryVisitorId;
  }
}

export function ProductInterestSurvey({ placement }: { placement: ProductInterestPlacement }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [choices, setChoices] = useState<ProductInterestChoice[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);

  useEffect(() => {
    const sync = () => {
      const saved = readPreference();
      setVisible(!saved.completed && saved.dismissedUntil <= Date.now());
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  if (!visible) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || choices.length === 0) return;
    submitLock.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/product-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), choices, placement }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "No pudimos guardar tu respuesta. Volvé a intentar.");
      }
      remember({ completed: true });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError"
        ? cause.message
        : "La conexión está demorando. Volvé a intentar.");
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={id + "-title"} className="mx-auto my-8 w-full max-w-5xl rounded-2xl border border-gloria-200 bg-gloria-50 p-5 text-left sm:my-12 sm:p-8" data-testid="product-interest-survey">
      {submitted ? (
        <div role="status" className="flex items-start gap-3">
          <Check className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id={id + "-title"} className="text-xl font-bold text-gloria-950">¡Gracias por ayudarnos a elegir!</h2>
            <p className="mt-2 text-sm leading-6 text-gloria-800">Tu respuesta ya quedó guardada. La tendremos en cuenta para las próximas prendas.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-6 md:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gloria-700">Elegimos con vos</p>
            <h2 id={id + "-title"} className="mt-2 text-2xl font-black leading-tight text-gloria-950">¿Qué prendas te gustaría que sumemos?</h2>
            <p className="mt-3 text-sm leading-6 text-gloria-800">Estamos pensando en ampliar el catálogo. Tu opinión nos ayuda a decidir.</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Es una encuesta, no una reserva de compra.</p>
          </div>
          <div>
            <fieldset disabled={saving} aria-describedby={id + "-hint"}>
              <legend className="mb-3 text-sm font-bold text-gloria-950">Elegí hasta 2 opciones</legend>
              <div className="flex flex-col gap-2">
                {PRODUCT_INTEREST_OPTIONS.map((option) => {
                  const checked = choices.includes(option.value);
                  const disabled = saving || (!checked && choices.length === 2);
                  return (
                    <label key={option.value} className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
                      checked ? "border-primary bg-gloria-100 text-gloria-950" : "border-gloria-200 bg-background text-gloria-900",
                      disabled && !checked ? "cursor-not-allowed opacity-50" : "hover:border-primary",
                    )}>
                      <input type="checkbox" checked={checked} disabled={disabled}
                        onChange={() => setChoices((current) => toggleProductInterest(current, option.value))}
                        className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p id={id + "-hint"} aria-live="polite" className="mt-3 text-xs leading-5 text-gloria-800">
              {choices.length === 2 ? "2 de 2. Desmarcá una opción si querés cambiarla." : choices.length + " de 2 seleccionadas."}
            </p>
            {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={saving || choices.length === 0} className="min-h-11">
                {saving ? "Guardando…" : "Enviar respuesta"}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} className="min-h-11"
                onClick={() => {
                  remember({ dismissedUntil: Date.now() + 7 * 24 * 60 * 60 * 1000 });
                  setVisible(false);
                }}>
                Ahora no
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
