"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProductShareActions({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareProduct() {
    if (navigator.share) {
      await navigator.share({
        title,
        text: `Mirá ${title} en Pilchería Gloria`,
        url,
      });
      return;
    }

    await copyLink();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 rounded-full text-muted-foreground"
      onClick={shareProduct}
    >
      {copied ? (
        <Check className="mr-2 size-4 text-green-700" />
      ) : (
        <Share2 className="mr-2 size-4" />
      )}
      {copied ? "Enlace copiado" : "Compartir"}
    </Button>
  );
}
