import { Footer } from "@/components/storefront/footer";
import { StorefrontClientShell } from "@/components/storefront/storefront-client-shell";
import { WhatsAppFloatingButton } from "@/components/storefront/whatsapp-floating-button";
import type { StoreSettings } from "@/types";

interface StorefrontShellProps {
  children: React.ReactNode;
  settings: StoreSettings;
}

export function StorefrontShell({ children, settings }: StorefrontShellProps) {
  return (
    <>
      <StorefrontClientShell />
      <div id="contenido-principal" className="flex-1" tabIndex={-1}>
        {children}
      </div>
      <WhatsAppFloatingButton
        phone={settings.whatsapp_phone}
        storeName={settings.store_name}
      />
      <Footer settings={settings} />
    </>
  );
}
