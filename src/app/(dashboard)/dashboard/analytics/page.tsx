import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  CreditCard,
  Eye,
  Lightbulb,
  MousePointerClick,
  ShoppingCart,
  Smartphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireAdmin } from "@/actions/auth";
import { getAnalyticsDashboard } from "@/lib/analytics/server";
import { SCHOOL_UNIFORM_FILTERS } from "@/lib/school-uniforms";
import { formatPrice } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function getRecommendations(data: Awaited<ReturnType<typeof getAnalyticsDashboard>>) {
  const { metrics } = data;
  const recommendations: string[] = [];
  const productToCart = percent(metrics.cart_sessions, metrics.product_viewers);
  const cartToCheckout = percent(metrics.checkout_sessions, metrics.cart_sessions);
  const checkoutToPurchase = percent(
    metrics.purchasing_sessions,
    metrics.checkout_sessions
  );

  if (metrics.product_viewers >= 10 && productToCart < 20) {
    recommendations.push(
      "Muchas personas miran prendas pero no las agregan. Revisá primero fotos, precio visible y claridad de talles."
    );
  }
  if (metrics.cart_sessions >= 5 && cartToCheckout < 50) {
    recommendations.push(
      "Hay carritos que no llegan al checkout. Conviene revisar que envío, retiro y total se entiendan antes de continuar."
    );
  }
  if (metrics.checkout_sessions >= 5 && checkoutToPurchase < 50) {
    recommendations.push(
      "La mayor caída está al pagar. Probá el flujo de Mercado Pago desde un celular y revisá los errores recientes."
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
  const { metrics } = data;
  const funnel = [
    { label: "Visitaron la tienda", value: metrics.visitors, icon: Users },
    { label: "Vieron una prenda", value: metrics.product_viewers, icon: Eye },
    { label: "Agregaron al carrito", value: metrics.cart_sessions, icon: ShoppingCart },
    { label: "Llegaron al checkout", value: metrics.checkout_sessions, icon: CreditCard },
    { label: "Compraron", value: metrics.purchasing_sessions, icon: Banknote },
  ];
  const recommendations = getRecommendations(data);
  const trackingStartLabel = data.tracking_started_at
    ? new Date(data.tracking_started_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "el próximo despliegue";
  const maxDailyVisitors = Math.max(1, ...data.daily.map((item) => item.visitors));
  const maxSourceSessions = Math.max(1, ...data.sources.map((item) => item.sessions));
  const maxDeviceSessions = Math.max(1, ...data.devices.map((item) => item.sessions));

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

      <section className="overflow-hidden rounded-2xl bg-gloria-950 text-white">
        <div className="grid gap-px bg-white/10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <Users className="size-4" /> Visitantes únicos
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {metrics.visitors.toLocaleString("es-AR")}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {metrics.page_views.toLocaleString("es-AR")} páginas vistas
            </p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <Banknote className="size-4" /> Ventas cobradas
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">{formatPrice(metrics.revenue)}</p>
            <p className="mt-2 text-sm text-white/60">{metrics.paid_orders} pedidos</p>
          </div>
          <div className="bg-gloria-950 p-5 sm:p-7">
            <div className="flex items-center gap-2 text-sm font-semibold text-gloria-200">
              <MousePointerClick className="size-4" /> Conversión
            </div>
            <p className="mt-3 text-2xl font-black sm:text-3xl">
              {percent(metrics.purchasing_sessions, metrics.visitors)}%
            </p>
            <p className="mt-2 text-sm text-white/60">de visita a compra</p>
          </div>
        </div>
      </section>
      <p className="-mt-3 text-xs leading-5 text-muted-foreground">
        El recorrido de las visitas se mide desde {trackingStartLabel}. Las ventas
        cobradas incluyen el historial completo de pedidos del período elegido.
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
                  <div className="h-full rounded-full bg-primary" style={{ width: `${percent(step.value, metrics.visitors)}%` }} />
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

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle>Actividad diaria</CardTitle>
            <p className="text-sm text-muted-foreground">Visitantes por día; el punto verde indica una compra.</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2"><CardTitle>Prendas con más interés</CardTitle></CardHeader>
          <CardContent className="p-4 sm:p-6">
            {data.top_products.length ? (
              <div className="divide-y">
                {data.top_products.map((product, index) => (
                  <Link key={product.product_id} href={`/products/${product.slug}`} className="grid min-h-14 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:text-primary">
                    <span className="text-sm font-black text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-sm font-bold">{product.name}</span>
                    <span className="text-right text-xs text-muted-foreground">{product.views} vistas · {product.cart_adds} carritos</span>
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
