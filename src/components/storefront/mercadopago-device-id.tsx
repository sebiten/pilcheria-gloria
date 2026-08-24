"use client";

import Script from "next/script";

declare global {
  interface Window {
    MP_DEVICE_SESSION_ID?: string;
  }
}

export function getMercadoPagoDeviceId() {
  const deviceId = window.MP_DEVICE_SESSION_ID?.trim();
  if (
    !deviceId ||
    deviceId.length > 256 ||
    !/^[\x21-\x7e]+$/.test(deviceId)
  ) {
    return null;
  }
  return deviceId;
}

export function MercadoPagoDeviceIdScript() {
  const mercadoPagoAttributes = { view: "checkout" };
  return (
    <Script
      {...mercadoPagoAttributes}
      id="mercadopago-device-id"
      src="https://www.mercadopago.com/v2/security.js"
      strategy="afterInteractive"
    />
  );
}
