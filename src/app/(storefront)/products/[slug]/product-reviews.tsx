import { Star } from "lucide-react";
import {
  getProductReviews,
  getProductReviewStats,
} from "@/actions/reviews";
import { ReviewPanel } from "./review-panel";

export function RatingStars({ rating }: { rating: number }) {
  const roundedRating = Math.round(rating);

  return (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < roundedRating ? "fill-primary text-primary" : "text-muted"
          }`}
        />
      ))}
    </div>
  );
}

export async function ProductReviewSummary({ productId }: { productId: string }) {
  const stats = await getProductReviewStats(productId);
  if (stats.count === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <RatingStars rating={stats.average} />
      <span className="text-sm text-muted-foreground">
        {`${stats.average.toFixed(1)} (${stats.count} ${
          stats.count === 1 ? "reseña" : "reseñas"
        })`}
      </span>
    </div>
  );
}

export async function ProductReviews({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const reviews = await getProductReviews(productId);

  if (reviews.length === 0) {
    return <ReviewPanel productId={productId} productSlug={productSlug} />;
  }

  return (
    <section className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-3xl text-gloria-950">Reseñas de clientes</h2>
          <p className="text-sm text-muted-foreground">
            Opiniones verificadas de clientes que compraron este producto.
          </p>
        </div>

        <div className="space-y-3">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-xl border bg-card p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <RatingStars rating={review.rating} />
                  <span className="font-medium">
                    {review.reviewer_name || "Cliente"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-AR").format(
                      new Date(review.created_at)
                    )}
                  </span>
                </div>
                {review.title ? (
                  <h3 className="mb-1 font-semibold">{review.title}</h3>
                ) : null}
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              </article>
            ))}
        </div>
      </div>

      <div>
        <ReviewPanel productId={productId} productSlug={productSlug} />
      </div>
    </section>
  );
}
