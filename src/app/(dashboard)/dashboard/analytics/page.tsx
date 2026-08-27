import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  CreditCard,
  CircleX,
  Clock3,
  Lightbulb,
  MousePointerClick,
  PackageCheck,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
  RadioTower,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireAdmin } from "@/actions/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/server";
import { SCHOOL_UNIFORM_FILTERS } from "@/lib/school-uniforms";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsDeviceControl } from "@/components/dashboard/analytics-device-control";

export const metadata: Metadata = { title: "Estadísticas de la tienda" };

type AnalyticsPageProps = {
  searchParams: Promise<{ days?: string }>;
};

const sourceLabels = {
  direct: "Directo",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  other: "Otros",
} as const;

const deviceLabels = {
  mobile: "Celular",
  tablet: "Tablet",
  desktop: "Computadora",
} as const;

const checkoutErrorLabels = {
  missing_name: "Falta nombre",
  invalid_email: "Email inválido",
  invalid_phone: "WhatsApp inválido",
  shipping_unavailable: "Entrega no disponible",
  missing_address: "Falta dirección",
  coupon_pending: "Cupón sin aplicar",
  api_client_error: "Datos rechazados",
  api_server_error: "Error al iniciar el pago",
  missing_payment_link: "Faltó enlace de Mercado Pago",
} as const;

const checkoutBlockerLabels = {
  cart_refresh_failed: "Falló la actualización del carrito",
  item_unavailable: "Prenda o talle no disponible",
  no_shipping_method: "Sin método de entrega",
  no_payment_provider: "Sin procesador de pago",
} as const;

const rejectionCategoryLabels = {
  data: "Datos mal ingresados",
  issuer: "Fondos o banco emisor",
  risk: "Validación de seguridad",
  other: "Otro motivo",
} as const;

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function getRecommendations(data: Awaited<ReturnType<typeof getAnalyticsDashboard>>) {
  const { metrics } = data;
  const recommendations: string[] = [];

  if (data.sample_warning) {
    return [
      `Hay ${metrics.product_viewers} aperturas de producto. Esperá 100 aperturas o 30 días comparables antes de cambiar fichas o surtido.`,
      "Compartí enlaces con utm_source y utm_campaign para comparar cada publicación.",
    ];
  }

  const productToSize = percent(
    metrics.size_selection_sessions,
    metrics.product_viewers
  );
  const sizeToIntent = percent(
    metrics.purchase_intent_sessions,
    metrics.size_selection_sessions
  );
  const checkoutToRedirect = percent(
    metrics.payment_redirect_sessions,
    metrics.checkout_sessions
  );
  const redirectToPayment = percent(
    metrics.payment_approved_sessions,
    metrics.payment_redirect_sessions
  );

  if (metrics.product_viewers >= 10 && productToSize < 30) {
    recommendations.push(
      "Muchas personas abren prendas pero no eligen talle. Revisá fotos, nombres de diseño y ayuda de talles."
    );
  }
  if (metrics.size_selection_sessions >= 5 && sizeToIntent < 40) {
    recommendations.push(
      "Eligen talle pero no intentan comprar. Revisá precio final, entrega y claridad de los botones de compra."
    );
  }
  if (metrics.checkout_sessions >= 5 && checkoutToRedirect < 50) {
    recommendations.push(
      "Entran al checkout pero no llegan a Mercado Pago. Revisá los errores de campos y que el total se entienda."
    );
  }
  if (metrics.payment_redirect_sessions >= 5 && redirectToPayment < 50) {
    recommendations.push(
      "Llegan a Mercado Pago pero no aprueban el pago. Revisá estados y medios de pago, sin cambiar el catálogo todavía."
    );
  }
  if (data.sources.length && (data.sources[0]?.source === "direct")) {
    recommendations.push(
      "Usá enlaces con ?utm_source=whatsapp o ?utm_source=facebook para saber qué publicación trae las visitas."
    );
  }
  if (!recommendations.length) {
    recommendations.push(
      "Todavía no aparece una caída clara. Esperá más visitas y compará los últimos 7 y 30 días."
    );
  }

  return recommendations.slice(0, 3);
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const requestedDays = Number(params.days || 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const data = await getAnalyticsDashboard(days);
  const metaPixelConfigured = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  const metaCapiConfigured = Boolean(process.env.META_CONVERSIONS_API_TOKEN);
  const { metrics } = data;
  const funnel = [
    { label: "Llegaron al checkout", value: metrics.checkout_sessions, icon: CreditCard },
    { label: "Checkout habilitado", value: metrics.checkout_ready_sessions, icon: ShieldCheck },
    { label: "Tocaron el pago", value: metrics.checkout_cta_sessions, icon: MousePointerClick },
    { label: "Datos válidos", value: metrics.checkout_submits, icon: BadgeCheck },
    { label: "Fueron al procesador", value: metrics.payment_redirect_sessions, icon: Send },
    { label: "Pago aprobado", value: metrics.payment_approved_sessions, icon: Banknote },
  ];
  const recommendations = getRecommendations(data);
  const trackingStartLabel = data.comparable_started_at
    ? new Date(data.comparable_started_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "el próximo despliegue";
  const maxDailyVisitors = Math.max(1, ...data.daily.map((item) => item.visitors));
  const maxSourceSessions = Math.max(1, ...data.sources.map((item) => item.sessions));
  const maxDeviceSessions = Math.max(1, ...data.devices.map((item) => item.sessions));
  const rejectedPayments = data.payment_rejection_reasons.reduce(
    (total, item) => total + item.payments,
    0
  );
  const knownRejectedPayments = data.payment_rejection_reasons.reduce(
    (total, item) => total + (item.detail === "unknown" ? 0 : item.payments),
    0
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-primary">Comportamiento de la tienda</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Estadísticas</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Seguí el recorrido desde la visita hasta el pago para decidir qué mejorar.
          </p>
        </div>
        <nav aria-label="Período de estadísticas" className="inline-flex w-fit rounded-xl border bg-card p-1">
          {[7, 30, 90].map((period) => (
            <Link
              key={period}
              href={`/dashboard/analytics?days=${period}`}
              aria-current={days === period ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-lg px-4 text-sm font-bold transition-colors ${
                days === period
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {period} días
            </Link>
          ))}
        </nav>
      </header>

      <AnalyticsDeviceControl />

      <section
        className={`flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
          metaPixelConfigured && metaCapiConfigured
            ? "border-primary/25 bg-primary/5"
            : "border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        <div className="flex items-start gap-3">
          <RadioTower className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-extrabold">
              {metaPixelConfigured && metaCapiConfigured
                ? "Meta Pixel y Conversiones API activos"
                : "Falta conectar la medición de Meta"}
            </p>
            <p className="mt-1 leading-5 opacity-75">
              {metaPixelConfigured && metaCapiConfigured
                ? "Meta recibe ficha, carrito, checkout y pagos aprobados con deduplicación."
                : "La web ya está preparada. Agregá el Pixel ID y el token de Conversiones API en Vercel."}
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-current/20 px-3 py-1 text-xs font-black uppercase tracking-wide">
          {metaPixelConfigured && metaCapiConfigured ? "Conectado" : "Pendiente"}
        </span>
      </section>

      {data.sample_warning ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
          Muestra chica: hay {metrics.product_viewers} aperturas de producto. Mirá
          los problemas operativos, pero esperá 100 aperturas o 30 días comparables
          antes de cambiar fichas o surtido.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-gloria-950 text-white">
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-5">
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <Users className="size-4" /> Entraron al catálogo
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {metrics.catalog_sessions.toLocaleString("es-AR")}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {metrics.visitors.toLocaleString("es-AR")} visitantes del sitio
            </p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <MousePointerClick className="size-4" /> Intención de compra
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">
              {metrics.purchase_intent_sessions}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {percent(metrics.purchase_intent_sessions, metrics.product_viewers)}% de quienes vieron una prenda
            </p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <CreditCard className="size-4" /> Pagos aprobados
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">
              {metrics.payment_approved_sessions}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {percent(metrics.payment_approved_sessions, metrics.catalog_sessions)}% del catálogo a pago
            </p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <PackageCheck className="size-4" /> Pedidos confirmados
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">
              {metrics.purchasing_sessions}
            </p>
            <p className="mt-2 text-sm text-white/60">
              Operativamente confirmados
            </p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <Banknote className="size-4" /> Ventas históricas
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">{formatPrice(metrics.revenue)}</p>
            <p className="mt-2 text-sm text-white/60">{metrics.paid_orders} pedidos</p>
          </div>
        </div>
      </section>
      <p className="-mt-3 text-xs leading-5 text-muted-foreground">
        Datos comparables desde el {trackingStartLabel}. “Pagos aprobados” viene del
        estado autorizado de Mercado Pago; “ventas históricas” incluye el historial
        completo del período.
      </p>

      <Card>
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <CardTitle>Embudo de compra</CardTitle>
          <p className="text-sm text-muted-foreground">Cada paso cuenta personas distintas, no cantidad de clics.</p>
        </CardHeader>
        <CardContent className="space-y-1 p-4 sm:p-6">
          {funnel.map((step, index) => {
            const previous = index === 0 ? step.value : funnel[index - 1].value;
            const Icon = step.icon;
            return (
              <div key={step.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 hover:bg-muted/50 sm:grid-cols-[13rem_minmax(8rem,1fr)_5rem_5rem]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                  <span className="truncate text-sm font-bold">{step.label}</span>
                </div>
                <div className="hidden h-2 overflow-hidden rounded-full bg-muted sm:block">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent(step.value, metrics.checkout_sessions)}%` }} />
                </div>
                <strong className="text-right text-lg">{step.value}</strong>
                <span className="col-span-2 pl-12 text-xs font-semibold text-muted-foreground sm:col-span-1 sm:pl-0 sm:text-right">
                  {index === 0 ? "100%" : `${percent(step.value, previous)}% pasa`}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-extrabold text-gloria-950">Empezaron a completar</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Indicador auxiliar: no es un paso obligatorio del embudo.
          </p>
        </div>
        <strong className="text-3xl font-black text-primary">
          {metrics.checkout_form_started_sessions}
        </strong>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle>Actividad diaria</CardTitle>
            <p className="text-sm text-muted-foreground">Entradas al catálogo por día; el punto verde indica un pago aprobado.</p>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="overflow-x-auto pb-2">
              <div className="flex h-48 min-w-max items-end gap-2 border-b px-1" role="img" aria-label="Gráfico de visitantes diarios">
                {data.daily.map((item) => (
                  <div key={item.date} className="flex w-6 flex-col items-center justify-end gap-1">
                    {item.purchases > 0 ? <span className="size-2 rounded-full bg-gloria-500" title={`${item.purchases} compras`} /> : <span className="h-2" />}
                    <div className="w-4 rounded-t bg-primary/75" style={{ height: `${Math.max(3, Math.round((item.visitors / maxDailyVisitors) * 120))}px` }} title={`${item.visitors} visitantes`} />
                    <span className="text-[0.62rem] text-muted-foreground">{new Date(`${item.date}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="flex items-center gap-2"><Lightbulb className="size-5 text-primary" /> Próximas mejoras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {recommendations.map((recommendation, index) => (
              <div key={recommendation} className="flex gap-3 text-sm leading-6">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{index + 1}</span>
                <p>{recommendation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <section>
        <p className="text-sm font-bold text-primary">Problemas operativos</p>
        <h2 className="mt-1 text-xl font-black text-gloria-950">Pagos y checkout</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Estos datos sí requieren acción inmediata porque bloquean compras ya iniciadas.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <span className="flex size-11 items-center justify-center rounded-full bg-red-100 text-red-800">
              <CircleX className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Pagos rechazados</p>
              <p className="text-3xl font-black text-gloria-950">{metrics.payment_rejected_sessions}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            <span className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Clock3 className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Pagos pendientes</p>
              <p className="text-3xl font-black text-gloria-950">{metrics.payment_pending_sessions}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="rounded-xl border bg-muted/40 p-4 text-sm leading-6">
        <p className="font-extrabold text-gloria-950">Criterio de revisión</p>
        <p className="mt-1 text-muted-foreground">
          Evaluá el resultado al llegar a 20 redirecciones a Mercado Pago. Hoy hay{" "}
          <strong>{metrics.payment_redirect_sessions}</strong>: se aprobó el{" "}
          <strong>{percent(metrics.payment_approved_sessions, metrics.payment_redirect_sessions)}%</strong>{" "}
          y conocemos el motivo del{" "}
          <strong>{percent(knownRejectedPayments, rejectedPayments)}%</strong> de los rechazos.
          Objetivo inicial: 50% de aprobación y 100% de motivos conocidos.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Distribution
          title="Motivos de rechazo"
          items={data.payment_rejection_reasons.map((item) => ({
            label: `${rejectionCategoryLabels[item.category]} · ${item.detail}`,
            value: item.payments,
          }))}
          max={Math.max(1, ...data.payment_rejection_reasons.map((item) => item.payments))}
          icon={CircleX}
        />
        <Distribution
          title="Errores del checkout"
          items={data.checkout_errors.map((item) => ({
            label: checkoutErrorLabels[item.detail],
            value: item.sessions,
          }))}
          max={Math.max(1, ...data.checkout_errors.map((item) => item.sessions))}
          icon={CreditCard}
        />
        <Distribution
          title={`Bloqueos del checkout · ${metrics.checkout_blocked_sessions}`}
          items={data.checkout_blockers.map((item) => ({
            label: checkoutBlockerLabels[item.detail],
            value: item.sessions,
          }))}
          max={Math.max(1, ...data.checkout_blockers.map((item) => item.sessions))}
          icon={ShieldCheck}
        />
      </div>

      <section>
        <p className="text-sm font-bold text-primary">Decisiones de catálogo</p>
        <h2 className="mt-1 text-xl font-black text-gloria-950">Interés por prenda y escuela</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Usá estas señales cuando haya 100 aperturas de producto o 30 días comparables.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2"><CardTitle>Prendas con más interés</CardTitle></CardHeader>
          <CardContent className="p-4 sm:p-6">
            {data.top_products.length ? (
              <div className="divide-y">
                {data.top_products.map((product, index) => (
                  <Link key={product.product_id} href={`/uniformes/${product.slug}`} className="grid min-h-14 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:text-primary">
                    <span className="text-sm font-black text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-sm font-bold">{product.name}</span>
                    <span className="text-right text-xs text-muted-foreground">{product.views} vistas · {product.size_selections} talles · {product.purchase_intents} intenciones</span>
                  </Link>
                ))}
              </div>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Los productos vistos aparecerán acá.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2"><CardTitle>Escuelas más buscadas</CardTitle></CardHeader>
          <CardContent className="p-4 sm:p-6">
            {data.top_schools.length ? (
              <div className="divide-y">
                {data.top_schools.map((school, index) => {
                  const label = SCHOOL_UNIFORM_FILTERS.find((item) => item.id === school.school_id)?.name || school.school_id;
                  return (
                    <div key={school.school_id} className="grid min-h-14 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <span className="text-sm font-black text-muted-foreground">{index + 1}</span>
                      <span className="truncate text-sm font-bold">{label}</span>
                      <span className="text-sm text-muted-foreground">{school.selections} búsquedas</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="py-8 text-center text-sm text-muted-foreground">Las escuelas elegidas aparecerán acá.</p>}
          </CardContent>
        </Card>
      </div>

      <CampaignAttribution campaigns={data.campaigns} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Distribution title="De dónde llegan" items={data.sources.map((item) => ({ label: sourceLabels[item.source] || "Otros", value: item.sessions }))} max={maxSourceSessions} icon={BarChart3} />
        <Distribution title="Dispositivos" items={data.devices.map((item) => ({ label: deviceLabels[item.device_type] || item.device_type, value: item.sessions }))} max={maxDeviceSessions} icon={Smartphone} />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold">También medimos {metrics.whatsapp_sessions} visitas a WhatsApp.</p>
          <p className="mt-1 text-muted-foreground">No se guardan IP, email, teléfono ni búsquedas escritas.</p>
        </div>
        <Link href="/dashboard/products" className="inline-flex min-h-11 items-center gap-2 font-bold text-primary">
          Mejorar catálogo <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}

function CampaignAttribution({
  campaigns,
}: {
  campaigns: Awaited<ReturnType<typeof getAnalyticsDashboard>>["campaigns"];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" /> Campañas y anuncios
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Usá un utm_content distinto en cada imagen o video.
        </p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {campaigns.length ? (
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <article
                key={`${campaign.campaign}:${campaign.medium ?? ""}:${campaign.content ?? ""}`}
                className="rounded-xl border border-border p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{campaign.campaign}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {campaign.content || "Anuncio sin identificar"}
                      {campaign.medium ? ` · ${campaign.medium}` : ""}
                    </p>
                  </div>
                  <strong className="text-sm text-primary">
                    {formatPrice(Number(campaign.revenue))}
                  </strong>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
                  {[
                    ["Catálogo", campaign.catalog_sessions],
                    ["Prenda", campaign.product_viewers],
                    ["Talle", campaign.size_selections],
                    ["Compra", campaign.purchase_intents],
                    ["Checkout", campaign.checkout_sessions],
                    ["M. Pago", campaign.payment_redirects],
                    ["Pagos", campaign.payment_approved],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg bg-muted/60 px-1 py-2">
                      <strong className="block text-base">{value}</strong>
                      <span className="text-[0.62rem] font-semibold text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay visitas con utm_campaign.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Distribution({ title, items, max, icon: Icon }: { title: string; items: Array<{ label: string; value: number }>; max: number; icon: LucideIcon }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2"><CardTitle className="flex items-center gap-2"><Icon className="size-5 text-primary" /> {title}</CardTitle></CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {items.length ? items.map((item) => (
          <div key={item.label}>
            <div className="mb-1.5 flex justify-between gap-4 text-sm"><span className="font-semibold">{item.label}</span><span className="text-muted-foreground">{item.value}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent(item.value, max)}%` }} /></div>
          </div>
        )) : <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay datos.</p>}
      </CardContent>
    </Card>
  );
}
