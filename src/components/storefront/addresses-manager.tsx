"use client";

import { useMemo, useState, useTransition } from "react";
import { MapPin, Star, Trash2 } from "lucide-react";
import { addAddress, deleteAddress, setDefaultAddress } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Address } from "@/types";

interface AddressesManagerProps {
  addresses: Address[];
}

const EMPTY_FORM = {
  name: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  isDefault: false,
};

export function AddressesManager({ addresses }: AddressesManagerProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasDefault = useMemo(
    () => addresses.some((address) => address.is_default),
    [addresses]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await addAddress({
          name: formData.name.trim(),
          street: formData.street.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          zip: formData.zip.trim() || undefined,
          isDefault: formData.isDefault || !hasDefault,
        });
        setFormData(EMPTY_FORM);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo guardar la direccion"
        );
      }
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAddress(id);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo eliminar la direccion"
        );
      }
    });
  };

  const handleSetDefault = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await setDefaultAddress(id);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo actualizar la direccion por defecto"
        );
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>Direcciones guardadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!addresses.length ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Todavia no tenes direcciones guardadas.
            </div>
          ) : (
            addresses.map((address) => (
              <div
                key={address.id}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{address.name}</p>
                      {address.is_default ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-gloria-800">
                          Predeterminada
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {address.street}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {address.city}, {address.state}
                      {address.zip ? `, ${address.zip}` : ""}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {!address.is_default ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(address.id)}
                        disabled={isPending}
                      >
                        <Star className="h-4 w-4" />
                        Usar por defecto
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(address.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nueva direccion</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Destinatario</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Nombre completo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Calle y numero</Label>
              <Input
                id="street"
                name="street"
                value={formData.street}
                onChange={handleChange}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Provincia</Label>
                <Input
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="zip">Codigo postal</Label>
              <Input
                id="zip"
                name="zip"
                value={formData.zip}
                onChange={handleChange}
              />
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                checked={formData.isDefault}
                onChange={handleChange}
              />
              Guardar como direccion predeterminada
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar direccion"}
            </Button>
          </form>

          <div className="mt-6 rounded-lg bg-[#f8f4f0] p-4 text-sm text-muted-foreground">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <MapPin className="h-4 w-4 text-[#f6ae66]" />
              Uso en checkout
            </div>
            Tus direcciones guardadas quedan disponibles para reutilizarlas en la compra.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
