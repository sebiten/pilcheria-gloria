"use client";

import { useState, useTransition } from "react";
import { updateBankTransferSettings } from "@/actions/bank-transfer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BankTransferSettings } from "@/types";

export function BankTransferSettingsForm({
  settings,
  hasWhatsapp,
}: {
  settings: BankTransferSettings;
  hasWhatsapp: boolean;
}) {
  const [form, setForm] = useState({
    enabled: settings.enabled,
    accountAlias: settings.account_alias,
    accountHolder: settings.account_holder,
    institutionName: settings.institution_name || "",
    accountNumber: settings.account_number || "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        await updateBankTransferSettings(form);
        setMessage("Configuración de transferencia guardada.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo guardar.");
      }
    });
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader><CardTitle>Transferencia bancaria</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border p-4 md:col-span-2">
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="mt-1" />
            <span><span className="block font-semibold">Activar transferencia bancaria</span><span className="mt-1 block text-sm text-muted-foreground">Solo aparecerá si alias, titular y WhatsApp están completos.</span></span>
          </label>
          {!hasWhatsapp ? <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 md:col-span-2">Completá un WhatsApp válido en Información del negocio para habilitar este método.</p> : null}
          <Field label="Alias" value={form.accountAlias} onChange={(value) => setForm((current) => ({ ...current, accountAlias: value }))} required={form.enabled} />
          <Field label="Titular" value={form.accountHolder} onChange={(value) => setForm((current) => ({ ...current, accountHolder: value }))} required={form.enabled} />
          <Field label="Banco o billetera (opcional)" value={form.institutionName} onChange={(value) => setForm((current) => ({ ...current, institutionName: value }))} />
          <Field label="CBU / CVU (opcional)" value={form.accountNumber} onChange={(value) => setForm((current) => ({ ...current, accountNumber: value }))} />
          {message ? <p className="text-sm font-semibold md:col-span-2">{message}</p> : null}
          <Button type="submit" disabled={isPending} className="md:col-span-2 md:w-fit">{isPending ? "Guardando…" : "Guardar transferencia"}</Button>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}
