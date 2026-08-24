export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getAddresses, getProfile } from "@/actions/auth";
import { getStoreSettings } from "@/actions/store-settings";
import { CheckoutForm } from "./checkout-form";
import { getEnabledPaymentProviders } from "@/lib/payments/providers";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const [addresses, profile, settings] = await Promise.all([
    getAddresses(),
    getProfile(),
    getStoreSettings(),
  ]);

  return (
    <CheckoutForm
      addresses={addresses}
      profile={profile}
      settings={settings}
      enabledPaymentProviders={getEnabledPaymentProviders()}
    />
  );
}
