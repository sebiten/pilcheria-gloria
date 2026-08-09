"use client";

import { useState, useTransition } from "react";
import { updateStoreSettings } from "@/actions/store-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StoreSettings } from "@/types";

interface StoreSettingsFormProps {
  settings: StoreSettings;
}

export function StoreSettingsForm({ settings }: StoreSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    storeName: settings.store_name,
    contactEmail: settings.contact_email,
    contactPhone: settings.contact_phone,
    whatsappPhone: settings.whatsapp_phone || "",
    addressLine: settings.address_line,
    city: settings.city,
    state: settings.state,
    businessHours: settings.business_hours,
    instagramUrl: settings.instagram_url || "",
    facebookUrl: settings.facebook_url || "",
    footerText: settings.footer_text,
    pickupEnabled: settings.pickup_enabled,
    localDeliveryEnabled: settings.local_delivery_enabled,
    localDeliveryCost: String(settings.local_delivery_cost),
    pickupInstructions: settings.pickup_instructions,
    legalName: settings.legal_name || "",
    taxId: settings.tax_id || "",
    legalAddress: settings.legal_address || "",
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await updateStoreSettings({
          storeName: formData.storeName,
          contactEmail: formData.contactEmail,
          contactPhone: formData.contactPhone,
          whatsappPhone: formData.whatsappPhone,
          addressLine: formData.addressLine,
          city: formData.city,
          state: formData.state,
          businessHours: formData.businessHours,
          instagramUrl: formData.instagramUrl,
          facebookUrl: formData.facebookUrl,
          footerText: formData.footerText,
          pickupEnabled: formData.pickupEnabled,
          localDeliveryEnabled: formData.localDeliveryEnabled,
          localDeliveryCost: Number(formData.localDeliveryCost),
          pickupInstructions: formData.pickupInstructions,
          legalName: formData.legalName,
          taxId: formData.taxId,
          legalAddress: formData.legalAddress,
        });
        setSuccess("Configuración guardada.");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "No se pudo guardar la configuración"
        );
      }
    });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {[
        settings.address_line,
        settings.business_hours,
        settings.contact_phone,
        settings.legal_name,
        settings.tax_id,
        settings.legal_address,
      ].some((value) => !value || /completar|confirmar/i.test(value)) ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">La tienda todavía no está lista para vender.</p>
          <p className="mt-1">
            Completá dirección, horarios, contacto, razón social, CUIT y domicilio legal.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Información del negocio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre comercial" name="storeName" value={formData.storeName} onChange={handleChange} />
          <Field label="Email de contacto" name="contactEmail" type="email" value={formData.contactEmail} onChange={handleChange} />
          <Field label="Teléfono" name="contactPhone" value={formData.contactPhone} onChange={handleChange} />
          <Field label="WhatsApp" name="whatsappPhone" value={formData.whatsappPhone} onChange={handleChange} />
          <div className="md:col-span-2">
            <Field label="Dirección de retiro" name="addressLine" value={formData.addressLine} onChange={handleChange} />
          </div>
          <Field label="Ciudad" name="city" value={formData.city} onChange={handleChange} />
          <Field label="Provincia / País" name="state" value={formData.state} onChange={handleChange} />
          <div className="md:col-span-2">
            <Field label="Horarios" name="businessHours" value={formData.businessHours} onChange={handleChange} />
          </div>
          <div className="md:col-span-2">
            <Field label="Texto del footer" name="footerText" value={formData.footerText} onChange={handleChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información legal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre o razón social" name="legalName" value={formData.legalName} onChange={handleChange} />
          <Field label="CUIT" name="taxId" value={formData.taxId} onChange={handleChange} />
          <div className="md:col-span-2">
            <Field label="Domicilio legal" name="legalAddress" value={formData.legalAddress} onChange={handleChange} />
          </div>
          <p className="text-sm text-muted-foreground md:col-span-2">
            Estos datos se muestran en términos, cambios y privacidad. Deben ser reales antes de publicar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redes sociales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Instagram" name="instagramUrl" value={formData.instagramUrl} onChange={handleChange} />
          <Field label="Facebook" name="facebookUrl" value={formData.facebookUrl} onChange={handleChange} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retiro y entrega local</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex min-h-20 items-start gap-3 rounded-xl border p-4">
            <input
              type="checkbox"
              checked={formData.pickupEnabled}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  pickupEnabled: event.target.checked,
                }))
              }
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Permitir retiro en el local</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                El cliente espera tu confirmación antes de acercarse.
              </span>
            </span>
          </label>
          <label className="flex min-h-20 items-start gap-3 rounded-xl border p-4">
            <input
              type="checkbox"
              checked={formData.localDeliveryEnabled}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  localDeliveryEnabled: event.target.checked,
                }))
              }
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Permitir entrega local</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Activala solo cuando tengas días, zonas y responsable definidos.
              </span>
            </span>
          </label>
          <Field
            label="Costo de entrega local"
            name="localDeliveryCost"
            type="number"
            min="0"
            value={formData.localDeliveryCost}
            onChange={handleChange}
            disabled={!formData.localDeliveryEnabled}
          />
          <div className="md:col-span-2">
            <Field
              label="Indicaciones para retiro"
              name="pickupInstructions"
              value={formData.pickupInstructions}
              onChange={handleChange}
            />
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
