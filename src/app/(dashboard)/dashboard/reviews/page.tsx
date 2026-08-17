import Link from "next/link";
import { Star } from "lucide-react";
import {
  deleteProductReviewAdmin,
  getProductReviewsAdmin,
  setProductReviewApproval,
} from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/actions/auth";

export default async function ReviewsPage() {
  await requireAdmin();
  const reviews = await getProductReviewsAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Reseñas</h1>
        <p className="text-muted-foreground">
          {reviews.length} reseña{reviews.length === 1 ? "" : "s"} recibida
          {reviews.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="space-y-3">
        {reviews.map((review: any) => {
          const product = Array.isArray(review.product)
            ? review.product[0]
            : review.product;

          return (
            <article key={review.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <Star className="size-4 fill-primary text-primary" />
                      {review.rating}/5
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        review.approved
                          ? "bg-green-100 text-green-800"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {review.approved ? "Publicada" : "Oculta"}
                    </span>
                  </div>
                  <h2 className="mt-3 font-bold">
                    {review.title || "Reseña sin título"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {review.reviewer_name || "Cliente"} ·{" "}
                    {new Date(review.created_at).toLocaleDateString("es-AR")}
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-6">{review.comment}</p>
                  {product?.slug ? (
                    <Link
                      href={`/uniformes/${product.slug}`}
                      className="mt-3 inline-block text-sm font-bold text-primary"
                    >
                      Ver {product.name}
                    </Link>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <form
                    action={setProductReviewApproval.bind(
                      null,
                      review.id,
                      !review.approved
                    )}
                  >
                    <Button className="min-h-11" type="submit" variant="outline">
                      {review.approved ? "Ocultar" : "Publicar"}
                    </Button>
                  </form>
                  <form action={deleteProductReviewAdmin.bind(null, review.id)}>
                    <Button className="min-h-11" type="submit" variant="destructive">
                      Eliminar
                    </Button>
                  </form>
                </div>
              </div>
            </article>
          );
        })}

        {!reviews.length ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            Todavía no hay reseñas para moderar.
          </div>
        ) : null}
      </div>
    </div>
  );
}
