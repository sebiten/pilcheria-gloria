"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteProduct } from "@/actions/products";
import { Button } from "@/components/ui/button";

interface DeleteProductButtonProps {
  productId: string;
  productName: string;
}

export function DeleteProductButton({
  productId,
  productName,
}: DeleteProductButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    const confirmed = window.confirm(
      `Vas a borrar "${productName}". Esta accion no se puede deshacer.`
    );

    if (!confirmed) return;

    startTransition(async () => {
      try {
        await deleteProduct(productId);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "No se pudo borrar el producto"
        );
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isPending}
        onClick={handleDelete}
        className="h-11 w-11 text-destructive hover:text-destructive"
        title="Borrar producto"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
