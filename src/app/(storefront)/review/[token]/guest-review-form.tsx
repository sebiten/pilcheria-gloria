"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import { submitGuestProductReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initialState = { ok: false, message: "" };

export function GuestReviewForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    submitGuestProductReview,
    initialState
  );

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-gloria-300 bg-gloria-50 p-6 text-center">
        <Star className="mx-auto mb-3 size-8 fill-gloria-500 text-gloria-600" />
        <p className="font-semibold">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="rating">¿Cómo fue tu experiencia?</Label>
        <select
          id="rating"
          name="rating"
          defaultValue="5"
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
        >
          <option value="5">5 estrellas · Excelente</option>
          <option value="4">4 estrellas · Muy buena</option>
          <option value="3">3 estrellas · Buena</option>
          <option value="2">2 estrellas · Regular</option>
          <option value="1">1 estrella · Mala</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Título (opcional)</Label>
        <input
          id="title"
          name="title"
          maxLength={80}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
          placeholder="Ej.: Muy buena calidad"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Contanos cómo te fue</Label>
        <textarea
          id="comment"
          name="comment"
          minLength={10}
          maxLength={1000}
          required
          rows={5}
          className="w-full rounded-xl border border-input bg-background px-3 py-3 text-base"
          placeholder="Tu experiencia puede ayudar a otras familias a elegir."
        />
      </div>

      {state.message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="min-h-12 w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar reseña"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        La publicación se revisa para proteger la privacidad de todos.
      </p>
    </form>
  );
}
