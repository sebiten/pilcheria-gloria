import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  MapPin,
  PackageCheck,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { getOrderForConfirmation } from "@/actions/orders";
import {
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/commerce";
import { getOrderConfirmationCookieName } from "@/lib/orders/confirmation-access";
import { ClearCartOnMount } from "./clear-cart-on-mount";
import styles from "./purchase-celebration.module.css";

export const metadata: Metadata = {
  title: "Confirmación del pedido",
  robots: { index: false, follow: false },
};

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    token?: string;
    payment_id?: string;
    collection_id?: string;
    verification?: string;
  }>;
}

const CONFIRMED_STATUSES = new Set([
  "paid",
  "payment_review",
  "ready_for_pickup",
  "shipped",
  "delivered",
]);

function Confetti() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {Array.from({ length: 15 }, (_, index) => (
        <i className={styles.confetti} key={index} />
      ))}
    </div>
  );
}

function getNextStepTitle(status: string, isPickup: boolean) {
  switch (status) {
    case "payment_review":
      return "Estamos verificando tu pedido";
    case "ready_for_pickup":
      return "Tu pedido ya está listo para retirar";
    case "shipped":
      return "Tu pedido está en camino";
    case "delivered":
      return "Pedido entregado";
    default:
      return isPickup
        ? "Te avisaremos cuando esté listo para retirar"
        : "Estamos preparando tu entrega";
  }
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderConfirmationPageProps) {
  const { id } = await params;
  const { token, payment_id, collection_id, verification } = await searchParams;

  if (token) {
    redirect(
      `/api/order-confirmation/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
    );
  }

  const returnPaymentId = payment_id || collection_id;

  if (returnPaymentId) {
    redirect(
      `/api/order-confirmation/${encodeURIComponent(id)}?payment_id=${encodeURIComponent(returnPaymentId)}`
    );
  }

  const accessToken = (await cookies()).get(
    getOrderConfirmationCookieName(id)
  )?.value;
  let order;

  try {
    order = await getOrderForConfirmation(id, accessToken);
  } catch {
    order = null;
  }

  const isConfirmed = Boolean(order && CONFIRMED_STATUSES.has(order.status));

  const orderCode = id.slice(0, 8).toUpperCase();
  const retryPath = `/api/order-confirmation/${encodeURIComponent(id)}?retry=1`;
  const isPending = order?.status === "pending";

  if (isConfirmed && order) {
    const isPickup = order.shipping_method !== "local_delivery";

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <ClearCartOnMount />
        <section
          className={`${styles.stage} ${styles.stitch} relative isolate overflow-hidden rounded-[2rem] px-5 py-9 text-white shadow-[0_28px_80px_-38px_rgba(11,38,11,0.8)] sm:px-10 sm:py-12`}
        >
          <Confetti />
          <div className="relative z-10">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-white/25 bg-gloria-500 text-gloria-950 shadow-[0_0_0_8px_rgba(255,255,255,0.08)] sm:size-20">
              <Check className="size-8 stroke-[3] sm:size-10" />
            </div>
            <p className="mt-6 text-center text-xs font-black uppercase tracking-[0.22em] text-gloria-200">
              Pago confirmado
            </p>
            <h1 className="mx-auto mt-2 max-w-xl text-center font-display text-[clamp(2.8rem,13vw,5.4rem)] leading-[0.88] tracking-[-0.045em]">
              ¡Gracias por tu compra!
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-center text-sm leading-6 text-white/80 sm:text-base">
              Ya recibimos tu pedido. Podés quedarte tranquilo: el pago quedó
              registrado correctamente.
            </p>

            <div className="mx-auto mt-7 grid max-w-xl gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 sm:grid-cols-2">
              <div className="bg-gloria-950/70 p-4 text-center sm:text-left">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gloria-200">
                  Código de pedido
                </span>
                <p className="mt-1 font-mono text-xl font-black tracking-[0.12em]">
                  {orderCode}
                </p>
              </div>
              <div className="bg-gloria-950/70 p-4 text-center sm:text-left">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-gloria-200">
                  Total pagado
                </span>
                <p className="mt-1 text-xl font-black">
                  {formatPrice(Number(order.total))}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mx-2 -mt-3 rounded-[1.6rem] border border-gloria-200 bg-background p-5 shadow-[0_18px_50px_-32px_rgba(11,38,11,0.45)] sm:mx-6 sm:p-7">
          <div className="flex gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gloria-100 text-gloria-800">
              {isPickup ? (
                <MapPin className="size-5" />
              ) : (
                <PackageCheck className="size-5" />
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-gloria-700">
                Ahora sigue esto
              </p>
              <h2 className="mt-1 text-lg font-black text-gloria-950">
                {getNextStepTitle(order.status, isPickup)}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {getOrderStatusDescription(order.status, order.shipping_method)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-dashed border-gloria-300 pt-4 text-sm">
            <ReceiptText className="size-4 shrink-0 text-gloria-700" />
            <span>
              Estado: <strong>{getOrderStatusLabel(order.status, order.shipping_method)}</strong>
            </span>
          </div>

          {order.guest_access_token ? (
            <p className="mt-4 rounded-xl bg-gloria-50 px-4 py-3 text-sm leading-6 text-gloria-950">
              Guardá el código <strong>{orderCode}</strong>. Te contactaremos al
              WhatsApp que ingresaste; si dejaste un email, también recibirás
              las novedades allí.
            </p>
          ) : null}

          {order.refund_status && order.refund_status !== "none" ? (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              <p className="font-bold">
                {order.refund_status === "pending"
                  ? "Tenés una devolución pendiente"
                  : "La devolución ya fue transferida"}
              </p>
              <p className="mt-1">
                {order.refund_status === "pending"
                  ? "Te contactaremos para solicitar tus datos bancarios y devolverte el importe correspondiente."
                  : `Importe transferido: ${formatPrice(Number(order.refunded_amount || 0))}.`}
              </p>
            </div>
          ) : null}
        </section>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button className="min-h-12 rounded-full px-6" asChild>
            <Link href="/uniformes">
              Seguir viendo uniformes <ArrowRight className="size-4" />
            </Link>
          </Button>
          {!order.guest_access_token ? (
            <Button className="min-h-12 rounded-full px-6" variant="outline" asChild>
              <Link href="/account/orders">Ver mis pedidos</Link>
            </Button>
          ) : null}
        </div>
      </main>
    );
  }

  if (isPending && order) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-12 text-center sm:py-16">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-gloria-100 text-gloria-800">
          <Clock3 className="size-8" />
        </div>
        <h1 className="mt-5 font-display text-4xl leading-none text-gloria-950">
          Estamos confirmando tu pago
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-7 text-muted-foreground">
          El pedido <strong>{orderCode}</strong> ya está registrado. Mercado Pago
          puede tardar unos instantes en enviarnos la confirmación.
        </p>
        <Button className="mt-7 min-h-12 w-full sm:w-auto" asChild>
          <a href={retryPath}>Verificar de nuevo</a>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 text-center sm:py-16">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-800">
        <CircleAlert className="size-8" />
      </div>
      <h1 className="mt-5 font-display text-4xl leading-none text-gloria-950">
        {verification === "pending"
          ? "Mercado Pago está demorando"
          : "No pudimos abrir el pedido"}
      </h1>
      <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-left text-amber-950">
        <p className="font-bold">Tu carrito sigue guardado.</p>
        <p className="mt-2 text-sm leading-6">
          {verification === "pending"
            ? "El pago todavía no pudo consultarse. Esperá unos segundos y reintentá: no vuelvas a pagar."
            : "Si el dinero fue debitado, no vuelvas a pagar. Contactanos e indicá el código de abajo para que podamos ayudarte."}
        </p>
        <div className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-center font-mono text-lg font-black tracking-[0.12em]">
          {orderCode}
        </div>
      </div>
      <div className="mt-7 flex flex-col gap-3">
        {verification === "pending" ? (
          <Button className="min-h-12" asChild>
            <a href={retryPath}>Reintentar verificación</a>
          </Button>
        ) : null}
        <Button className="min-h-12" variant="outline" asChild>
          <Link href="/cart">Volver al carrito</Link>
        </Button>
      </div>
    </main>
  );
}
