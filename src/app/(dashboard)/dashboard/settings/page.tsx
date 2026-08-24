import { getStoreSettings } from "@/actions/store-settings";
import { StoreSettingsForm } from "@/components/dashboard/store-settings-form";
import { requireAdmin } from "@/actions/auth";
import { getBankTransferSettings } from "@/actions/bank-transfer";
import { BankTransferSettingsForm } from "@/components/dashboard/bank-transfer-settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, bankTransferSettings] = await Promise.all([
    getStoreSettings(),
    getBankTransferSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Configuracion</h1>
        <p className="text-muted-foreground">
          Datos reales del negocio, contacto y envíos.
        </p>
      </div>

      <StoreSettingsForm settings={settings} />
      <BankTransferSettingsForm
        settings={bankTransferSettings}
        hasWhatsapp={Boolean(settings.whatsapp_phone?.replace(/\D/g, ""))}
      />
    </div>
  );
}
