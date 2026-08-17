"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyProductLinkButton({
  slug,
  productName,
}: {
  slug: string;
  productName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${window.location.origin}/uniformes/${slug}`
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-11 w-11"
      onClick={copyLink}
      title={copied ? "Enlace copiado" : `Copiar enlace de ${productName}`}
    >
      {copied ? (
        <Check className="size-4 text-green-700" />
      ) : (
        <Link2 className="size-4" />
      )}
      <span className="sr-only">
        {copied ? "Enlace copiado" : `Copiar enlace de ${productName}`}
      </span>
    </Button>
  );
}
