"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { getProductReviewEligibility } from "@/actions/reviews";
import type { PublicProductReview } from "@/types";
import { ReviewForm } from "./review-form";

type ReviewEligibility = {
  canReview: boolean;
  reason: string | null;
  existingReview: PublicProductReview | null;
};

interface ReviewPanelProps {
  productId: string;
  productSlug: string;
}

export function ReviewPanel({ productId, productSlug }: ReviewPanelProps) {
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setEligibility({
        canReview: false,
        reason: "Ingresá a tu cuenta para dejar una reseña verificada.",
        existingReview: null,
      });
      return;
    }

    let active = true;

    getProductReviewEligibility(productId)
      .then((data) => {
        if (active) {
          setEligibility({
            canReview: data.canReview,
            reason: data.reason,
            existingReview: data.existingReview,
          });
        }
      })
      .catch(() => {
        if (active) {
          setEligibility({
            canReview: false,
            reason: "No pudimos validar si puedes dejar una reseña.",
            existingReview: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, productId]);

  if (isLoaded && !isSignedIn) return null;

  if (!eligibility) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-lg font-semibold">Reseñas verificadas</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Validando si puedes dejar una reseña...
        </p>
      </div>
    );
  }

  if (eligibility.canReview) {
    return (
      <ReviewForm
        productId={productId}
        productSlug={productSlug}
        existingReview={eligibility.existingReview}
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-lg font-semibold">Reseñas verificadas</h3>
      <p className="mt-2 text-sm text-muted-foreground">{eligibility.reason}</p>
    </div>
  );
}
