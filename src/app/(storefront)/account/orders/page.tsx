import Link from "next/link";
import { getOrders } from "@/actions/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { getOrderStatusLabel } from "@/lib/commerce";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mis pedidos</h1>
          <p className="text-muted-foreground">
            Segui el estado de tus compras.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/uniformes">Seguir comprando</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!orders.length ? (
            <div className="p-6 text-sm text-muted-foreground">
              Todavia no tenes pedidos.
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="h-12 px-4 text-left font-medium">Pedido</th>
                    <th className="h-12 px-4 text-left font-medium">Fecha</th>
                    <th className="h-12 px-4 text-left font-medium">Estado</th>
                    <th className="h-12 px-4 text-left font-medium">Total</th>
                    <th className="h-12 px-4 text-right font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b">
                      <td className="p-4 font-medium">
                        {order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="p-4">
                        {new Date(order.created_at).toLocaleDateString("es-AR")}
                      </td>
                      <td className="p-4">
                        {getOrderStatusLabel(order.status, order.shipping_method)}
                      </td>
                      <td className="p-4">{formatPrice(Number(order.total))}</td>
                      <td className="p-4 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/account/orders/${order.id}`}>Ver detalle</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
