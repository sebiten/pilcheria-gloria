"use client";

import Script from "next/script";
import { flushMetaEventQueue } from "@/lib/meta/client";

export function MetaPixel({ pixelId }: { pixelId?: string }) {
  if (!pixelId || !/^\d{5,32}$/.test(pixelId)) return null;

  return (
    <>
      <Script id="meta-pixel-bootstrap" strategy="afterInteractive">
        {`!function(f,n){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);
fbq('set','autoConfig',false,${JSON.stringify(pixelId)});
fbq('init',${JSON.stringify(pixelId)});`}
      </Script>
      <Script
        id="meta-pixel-library"
        src="https://connect.facebook.net/en_US/fbevents.js"
        strategy="lazyOnload"
        onReady={flushMetaEventQueue}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height="1"
          width="1"
          className="hidden"
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
