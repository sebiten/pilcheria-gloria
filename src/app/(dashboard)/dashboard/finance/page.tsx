import {
  Banknote,
  HandCoins,
  PackageCheck,
  PiggyBank,
  Shirt,
  WalletCards,
} from "lucide-react";
import {
  createGrandmaSettlement,
  getInventoryDashboard,
  markOrderItemCollected,
} from "@/actions/inventory";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variants";

export default async function FinancePage() {
  const data = await getInventoryDashboard();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Inventario y liquidaciones</h1>
        <p className="text-muted-foreground">
          Control interno del stock propio y las prendas del negocio.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatsCard title="Stock propio" value={data.metrics.ownStock} description="Unidades con entrega inmediata" icon={Shirt} />
        <StatsCard title="Prendas por retirar" value={data.metrics.pendingCollectionQuantity} description="Pagadas y pendientes en el negocio" icon={PackageCheck} />
        <StatsCard title="Ventas propias" value={formatPrice(data.metrics.ownSales)} description="Neto cobrado de stock propio" icon={Banknote} />
        <StatsCard title="Comisión ganada" value={formatPrice(data.metrics.commissionEarned)} description="20% de prendas del negocio cobradas" icon={HandCoins} />
        <StatsCard title="Saldo para tu abuela" value={formatPrice(data.metrics.partnerBalance)} description="Retirado y aún no liquidado" icon={PiggyBank} />
        <StatsCard title="Liquidaciones pagadas" value={formatPrice(data.metrics.settlementsPaid)} description="Histórico registrado" icon={WalletCards} />
      </div>

      <Card>
        <CardHeader><CardTitle>Prendas pendientes de retirar</CardTitle></CardHeader>
        <CardContent>
          {data.pendingItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left">
                  <tr>
                    <th className="p-3">Pedido</th><th className="p-3">Prenda</th><th className="p-3">Variante</th><th className="p-3">Cantidad</th><th className="p-3">Para tu abuela</th><th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingItems.map((item: any) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-3 font-mono">{item.order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="p-3">{item.product?.name}</td>
                      <td className="p-3">{formatVariantLabel(item.variant)}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{formatPrice(Number(item.partner_share ?? 0))}</td>
                      <td className="p-3 text-right">
                        <form action={markOrderItemCollected.bind(null, item.id)}>
                          <Button size="sm">Marcar retirada</Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No hay prendas pagadas pendientes de retirar.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader><CardTitle>Liquidaciones registradas</CardTitle></CardHeader>
          <CardContent>
            {data.settlements.length ? (
              <div className="space-y-3">
                {data.settlements.map((settlement: any) => (
                  <div key={settlement.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0">
                    <div>
                      <p className="font-semibold">{new Date(settlement.paid_at).toLocaleString("es-AR")}</p>
                      {settlement.notes ? <p className="text-sm text-muted-foreground">{settlement.notes}</p> : null}
                    </div>
                    <p className="font-bold">{formatPrice(Number(settlement.total_amount))}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Todavía no registraste liquidaciones.</p>}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>Registrar pago</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">Se liquidará el saldo pendiente de {formatPrice(data.metrics.partnerBalance)}.</p>
            <form action={createGrandmaSettlement} className="space-y-3">
              <label htmlFor="notes" className="text-sm font-medium">Nota opcional</label>
              <textarea id="notes" name="notes" maxLength={500} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Ej. Transferencia del sábado" />
              <Button className="w-full" disabled={data.metrics.partnerBalance <= 0}>Registrar liquidación</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
