import {
  Banknote,
  CircleDollarSign,
  HandCoins,
  PackageCheck,
  PiggyBank,
  Shirt,
  WalletCards,
} from "lucide-react";
import {
  createGrandmaSettlement,
  completeManualTransferRefund,
  getInventoryDashboard,
  markOrderItemCollected,
  markOrderItemUnavailable,
} from "@/actions/inventory";
import { ConfirmSubmitButton } from "@/components/dashboard/confirm-submit-button";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { formatVariantLabel } from "@/lib/variants";

export default async function FinancePage() {
  const data = await getInventoryDashboard();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Inventario y liquidaciones</h1>
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
        <StatsCard title="Devoluciones pendientes" value={formatPrice(data.metrics.pendingRefundAmount)} description="Transferencias que todavía debés realizar" icon={CircleDollarSign} />
      </div>

      <Card className="admin-responsive-table overflow-hidden">
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
                      <td className="p-3 font-mono" data-primary="true">Pedido {item.order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="p-3" data-label="Prenda">{item.product?.name}</td>
                      <td className="p-3" data-label="Variante">{formatVariantLabel(item.variant)}</td>
                      <td className="p-3" data-label="Cantidad">{item.quantity}</td>
                      <td className="p-3" data-label="Para tu abuela">{formatPrice(Number(item.partner_share ?? 0))}</td>
                      <td className="p-3 text-right" data-actions="true" data-label="Acción">
                        <div className="grid gap-2 sm:flex sm:justify-end">
                          <form action={markOrderItemCollected.bind(null, item.id)}>
                            <Button className="min-h-11 w-full sm:w-auto">Marcar retirada</Button>
                          </form>
                          <form action={markOrderItemUnavailable.bind(null, item.id)}>
                            <ConfirmSubmitButton
                              variant="outline"
                              className="min-h-11 w-full text-destructive hover:text-destructive sm:w-auto"
                              confirmation="Se marcará esta prenda como no disponible y se creará una devolución pendiente por transferencia. ¿Continuar?"
                            >
                              No disponible
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No hay prendas pagadas pendientes de retirar.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devoluciones pendientes por transferencia</CardTitle>
        </CardHeader>
        <CardContent>
          {data.pendingRefunds.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.pendingRefunds.map((refund: any) => {
                const address = refund.order?.shipping_address as
                  | Record<string, string>
                  | null;

                return (
                  <article key={refund.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-mono text-sm font-semibold">
                          Pedido {refund.order.id.slice(0, 8).toUpperCase()}
                        </p>
                        <p className="mt-1 font-bold">{refund.item?.product?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatVariantLabel(refund.item?.variant)} · {refund.item?.quantity} unidad(es)
                        </p>
                      </div>
                      <p className="text-xl font-black">
                        {formatPrice(Number(refund.amount))}
                      </p>
                    </div>

                    <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                      <p>{address?.name || "Cliente sin nombre"}</p>
                      <p>{address?.phone || "Sin teléfono cargado"}</p>
                    </div>

                    <form
                      action={completeManualTransferRefund.bind(null, refund.id)}
                      className="mt-4 space-y-3"
                    >
                      <Input
                        name="transferReference"
                        required
                        maxLength={200}
                        placeholder="Referencia o comprobante de transferencia"
                      />
                      <Input
                        name="notes"
                        maxLength={500}
                        placeholder="Nota opcional"
                      />
                      <ConfirmSubmitButton
                        className="min-h-11 w-full"
                        confirmation={`Confirmás que transferiste ${formatPrice(Number(refund.amount))} al cliente?`}
                      >
                        Marcar transferencia realizada
                      </ConfirmSubmitButton>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay devoluciones pendientes.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader><CardTitle>Liquidaciones registradas</CardTitle></CardHeader>
          <CardContent>
            {data.settlements.length ? (
              <div className="space-y-3">
                {data.settlements.map((settlement: any) => (
                  <div key={settlement.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
              <Button className="min-h-11 w-full" disabled={data.metrics.partnerBalance <= 0}>Registrar liquidación</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
