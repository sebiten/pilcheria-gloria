import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { getOrderStatusLabel } from "@/lib/commerce";
import { requireAdmin } from "@/actions/auth";

const PAGE_SIZE = 20;

interface OrdersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireAdmin();
  const supabase = getSupabaseAdmin();
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page || "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * PAGE_SIZE;

  const { data: orders, count, error } = await supabase
    .from("orders")
    .select(`
      *,
      items:order_items(count)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const totalOrders = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-blue-100 text-blue-800",
    payment_review: "bg-orange-100 text-orange-900",
    ready_for_pickup: "bg-lime-100 text-lime-900",
    shipped: "bg-purple-100 text-purple-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Órdenes</h1>
        <p className="text-muted-foreground">
          {totalOrders} órdenes en total
        </p>
      </div>

      <Card className="admin-responsive-table overflow-hidden">
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="h-12 px-4 text-left align-middle font-medium">
                    Pedido
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">
                    Fecha
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">
                    Estado
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">
                    Total
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders?.map((order) => (
                  <tr key={order.id} className="border-b">
                    <td className="p-4 font-medium" data-primary="true">
                      {order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="p-4" data-label="Fecha">
                      {new Date(order.created_at).toLocaleDateString("es-AR")}
                    </td>
                    <td className="p-4" data-label="Estado">
                      <Badge className={statusColors[order.status] || ""}>
                        {getOrderStatusLabel(
                          order.status,
                          order.shipping_method
                        )}
                      </Badge>
                    </td>
                    <td className="p-4" data-label="Total">{formatPrice(Number(order.total))}</td>
                    <td className="p-4" data-actions="true" data-label="Acciones">
                      <Button variant="outline" className="min-h-11 w-full sm:w-auto" asChild>
                        <Link href={`/dashboard/orders/${order.id}`}>
                          Ver detalle
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!orders?.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No hay órdenes aún
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            {currentPage > 1 ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/dashboard/orders?page=${currentPage - 1}`}>
                  Anterior
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="min-h-11" disabled>
                Anterior
              </Button>
            )}
            {currentPage < totalPages ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={`/dashboard/orders?page=${currentPage + 1}`}>
                  Siguiente
                </Link>
              </Button>
            ) : (
              <Button variant="outline" className="min-h-11" disabled>
                Siguiente
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
