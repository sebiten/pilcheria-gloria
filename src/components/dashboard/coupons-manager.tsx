"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createCoupon, deleteCoupon } from "@/actions/coupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import type { Coupon, CouponType } from "@/types";

interface CouponsManagerProps {
  initialCoupons: Coupon[];
}

const EMPTY_FORM = {
  code: "",
  type: "percentage" as CouponType,
  value: "",
  minPurchase: "",
  maxUses: "",
  expiresAt: "",
  active: true,
};

export function CouponsManager({ initialCoupons }: CouponsManagerProps) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await createCoupon({
          code: formData.code,
          type: formData.type,
          value: Number(formData.value),
          minPurchase: formData.minPurchase ? Number(formData.minPurchase) : null,
          maxUses: formData.maxUses ? Number(formData.maxUses) : null,
          expiresAt: formData.expiresAt || null,
          active: formData.active,
        });
        setFormData(EMPTY_FORM);
        setIsCreating(false);
        window.location.reload();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo guardar el cupon"
        );
      }
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCoupon(id);
        setCoupons((current) => current.filter((coupon) => coupon.id !== id));
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo eliminar el cupon"
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Cupones</h1>
          <p className="text-muted-foreground">
            Gestiona descuentos aplicables en checkout.
          </p>
        </div>
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => setIsCreating((current) => !current)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo cupon
        </Button>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>Crear cupon</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="code">Codigo</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        code: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="BIENVENIDO10"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        type: event.target.value as CouponType,
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="percentage">Porcentaje</option>
                    <option value="fixed">Monto fijo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="value">Valor</Label>
                  <Input
                    id="value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.value}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        value: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="minPurchase">Compra minima</Label>
                  <Input
                    id="minPurchase"
                    type="number"
                    min="0"
                    value={formData.minPurchase}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        minPurchase: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="maxUses">Usos maximos</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    min="1"
                    value={formData.maxUses}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        maxUses: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="expiresAt">Expiracion</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={formData.expiresAt}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                  />
                </div>
                <label className="flex items-end gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  Activo
                </label>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="grid gap-2 sm:flex">
                <Button className="min-h-11" type="submit" disabled={isPending}>
                  {isPending ? "Guardando..." : "Crear cupon"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setIsCreating(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="admin-responsive-table overflow-hidden">
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="h-12 px-4 text-left font-medium">Codigo</th>
                  <th className="h-12 px-4 text-left font-medium">Descuento</th>
                  <th className="h-12 px-4 text-left font-medium">Uso</th>
                  <th className="h-12 px-4 text-left font-medium">Estado</th>
                  <th className="h-12 px-4 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b">
                    <td className="p-4 font-medium" data-primary="true">{coupon.code}</td>
                    <td className="p-4" data-label="Descuento">
                      {coupon.type === "percentage"
                        ? `${coupon.value}%`
                        : formatPrice(Number(coupon.value))}
                    </td>
                    <td className="p-4" data-label="Uso">
                      {coupon.used_count}
                      {coupon.max_uses ? ` / ${coupon.max_uses}` : ""}
                    </td>
                    <td className="p-4" data-label="Estado">
                      {coupon.active ? "Activo" : "Inactivo"}
                    </td>
                    <td className="p-4" data-actions="true" data-label="Acciones">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(coupon.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Eliminar cupón {coupon.code}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!coupons.length ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No hay cupones creados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
