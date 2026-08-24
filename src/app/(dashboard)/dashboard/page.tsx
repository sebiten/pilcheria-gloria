import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrderStatusLabel } from "@/lib/commerce";
import { getStoreSettings } from "@/actions/store-settings";
import { getStoreReadinessIssues } from "@/lib/store-readiness";
import { requireAdmin } from "@/actions/auth";

export default async function DashboardPage() {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const paidStatuses = ["paid", "ready_for_pickup", "shipped", "delivered"];
  const openStatuses = [
    "pending",
    "paid",
    "payment_review",
    "ready_for_pickup",
    "shipped",
  ];

  const [
    { data: orders, error: ordersError },
    { data: monthlyOrders, error: monthlyOrdersError },
    { count: pendingOrders, error: pendingOrdersError },
    { data: activeProducts, error: productsError },
    { count: adminCount, error: adminCountError },
    integrityResult,
    settings,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", monthStart.toISOString())
      .in("status", paidStatuses),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", openStatuses),
    supabase
      .from("products")
      .select("id, slug, base_price")
      .eq("active", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin"),
    supabase.rpc("get_commerce_integrity_report"),
    getStoreSettings(),
  ]);

  const queryError =
    ordersError ||
    monthlyOrdersError ||
    pendingOrdersError ||
    productsError ||
    adminCountError;
  if (queryError) throw queryError;

  const totalSales =
    monthlyOrders?.reduce((sum, order) => sum + Number(order.total), 0) || 0;
  const paidOrdersThisMonth = monthlyOrders?.length || 0;
  const totalProducts = activeProducts?.length || 0;
  const demoProducts =
    activeProducts?.filter((product) =>
      product.slug?.startsWith("gloria-demo-")
    ).length || 0;
  const readinessIssues = getStoreReadinessIssues(settings);
  const operationalWarnings = [
    readinessIssues.length > 0
      ? `Faltan datos del negocio: ${readinessIssues.join(", ")}.`
      : null,
    demoProducts > 0
      ? `${demoProducts} productos de demostración siguen activos.`
      : null,
    (adminCount ?? 0) > 1
      ? `Hay ${adminCount} perfiles administradores. Confirmá que ambos correspondan.`
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  const integrityChecks = (integrityResult.data || []) as Array<{
    check_key: string;
    label: string;
    status: "correct" | "warning" | "critical";
    issue_count: number;
  }>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">
          Gestión de Pilchería Gloria
        </p>
      </div>

      {operationalWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">La tienda todavía no está habilitada para vender.</p>
          {operationalWarnings.map((warning) => (
            <p key={warning} className="mt-1">
              {warning}
            </p>
          ))}
          <div className="mt-3 flex flex-wrap gap-3 font-semibold">
            <Link href="/dashboard/settings" className="underline">
              Completar configuración
            </Link>
            <Link href="/dashboard/products" className="underline">
              Revisar productos
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Ventas del mes"
          value={formatPrice(totalSales)}
          icon={DollarSign}
          description="Total de ventas"
        />
        <StatsCard
          title="Pedidos pendientes"
          value={pendingOrders ?? 0}
          icon={ShoppingCart}
          description="Órdenes por procesar"
        />
        <StatsCard
          title="Productos activos"
          value={totalProducts}
          icon={Package}
          description="En el catálogo"
        />
        <StatsCard
          title="Pedidos cobrados"
          value={paidOrdersThisMonth}
          icon={TrendingUp}
          description="Este mes"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimos pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            {orders && orders.length > 0 ? (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("es-AR")}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-medium">
                        {formatPrice(Number(order.total))}
                      </p>
                      <Badge
                        variant={
                          order.status === "paid"
                            ? "default"
                            : order.status === "pending"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {getOrderStatusLabel(
                          order.status,
                          order.shipping_method
                        )}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No hay pedidos aún</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link
              href="/dashboard/products/new"
              className="min-h-11 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <Package className="mb-2 h-5 w-5" />
              <p className="font-medium">Agregar producto</p>
              <p className="text-sm text-muted-foreground">
                Crear un nuevo producto en el catálogo
              </p>
            </Link>
            <Link
              href="/dashboard/orders"
              className="min-h-11 rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <ShoppingCart className="mb-2 h-5 w-5" />
              <p className="font-medium">Ver pedidos</p>
              <p className="text-sm text-muted-foreground">
                Gestionar órdenes de compra
              </p>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integridad operativa</CardTitle>
        </CardHeader>
        <CardContent>
          {integrityResult.error ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <p>No se pudo consultar el diagnóstico automático.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {integrityChecks.map((check) => {
                const Icon =
                  check.status === "correct"
                    ? CircleCheck
                    : check.status === "warning"
                      ? TriangleAlert
                      : CircleAlert;
                const tone =
                  check.status === "correct"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : check.status === "warning"
                      ? "border-amber-300 bg-amber-50 text-amber-950"
                      : "border-red-300 bg-red-50 text-red-950";

                return (
                  <div key={check.check_key} className={`rounded-xl border p-4 ${tone}`}>
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 size-5 shrink-0" />
                      <div>
                        <p className="font-semibold">{check.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide opacity-75">
                          {check.status === "correct"
                            ? "Correcto"
                            : check.status === "warning"
                              ? `Advertencia · ${check.issue_count}`
                              : `Crítico · ${check.issue_count}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
