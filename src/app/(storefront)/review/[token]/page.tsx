import type { Metadata } from "next";
import Link from "next/link";
import { getGuestReviewInvite } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuestReviewForm } from "./guest-review-form";

export const metadata: Metadata = {
  title: "Contanos tu experiencia",
  robots: { index: false, follow: false },
};

export default async function GuestReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getGuestReviewInvite(token);

  return (
    <main className="container flex min-h-[70svh] items-center justify-center px-4 py-10 sm:py-16">
      <Card className="w-full max-w-lg rounded-3xl">
        <CardHeader className="space-y-2 p-6 sm:p-8 sm:pb-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            Compra verificada
          </p>
          <CardTitle className="text-2xl leading-tight sm:text-3xl">
            {invite ? `¿Cómo te fue con ${invite.productName}?` : "Este enlace ya no está disponible"}
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {invite
              ? "Tu opinión ayuda a otras familias a elegir con más confianza."
              : "Puede que ya hayas enviado la reseña o que el enlace haya vencido."}
          </p>
        </CardHeader>
        <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
          {invite ? (
            <GuestReviewForm token={token} />
          ) : (
            <Button asChild variant="outline" size="lg" className="min-h-12 w-full">
              <Link href="/uniformes">Volver a la tienda</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
