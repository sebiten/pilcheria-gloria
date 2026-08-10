import Script from "next/script";
import { getStoreSettings } from "@/actions/store-settings";
import { JsonLd } from "@/components/seo/json-ld";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { getStorefrontJsonLd } from "@/lib/seo";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getStoreSettings();

  return (
    <>
      <JsonLd data={getStorefrontJsonLd(settings)} />
      <StorefrontShell settings={settings}>{children}</StorefrontShell>
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
if (!window.location.pathname.startsWith('/order-confirmation/')) {
  gtag('config', 'G-QVFH4THVE9', {
    page_location: window.location.origin + window.location.pathname,
    page_title: document.title
  });
}`}
      </Script>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-QVFH4THVE9"
        strategy="lazyOnload"
      />
    </>
  );
}
