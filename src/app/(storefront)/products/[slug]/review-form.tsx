"use client";

import { useActionState } from "react";
import { submitProductReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PublicProductReview } from "@/types";

interface ReviewFormProps {
  productId: string;
  productSlug: string;
  existingReview: PublicProductReview | null;
}

const initialState = {
  ok: false,
  message: "",
};

export function ReviewForm({
  productId,
  productSlug,
  existingReview,
}: ReviewFormProps) {
  const [state, action, pending] = useActionState(
    submitProductReview,
    initialState
  );

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="productSlug" value={productSlug} />

      <div>
        <h3 className="text-lg font-semibold">
          {existingReview ? "Editar tu reseña" : "Dejar una reseña"}
        </h3>
        <p className="text-sm text-muted-foreground">
          Tu opinion ayuda a otros clientes a elegir mejor.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rating">Puntaje</Label>
        <select
          id="rating"
          name="rating"
          defaultValue={existingReview?.rating ?? 5}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="5">5 estrellas</option>
          <option value="4">4 estrellas</option>
          <option value="3">3 estrellas</option>
          <option value="2">2 estrellas</option>
          <option value="1">1 estrella</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Titulo opcional</Label>
        <input
          id="title"
          name="title"
          defaultValue={existingReview?.title ?? ""}
          maxLength={80}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          placeholder="Ej: Muy comodo"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Comentario</Label>
        <textarea
          id="comment"
          name="comment"
          defaultValue={existingReview?.comment ?? ""}
          minLength={10}
          maxLength={1000}
          required
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Conta como fue tu experiencia con el producto..."
        />
      </div>

      {state.message ? (
        <p className={state.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar reseña"}
      </Button>
    </form>
  );
}
