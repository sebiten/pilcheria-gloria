import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export function getOrderConfirmationCookieName(orderId: string) {
  return `pg_order_${orderId.replaceAll("-", "")}`;
}

export function getOrderPaymentReturnCookieName(orderId: string) {
  return `pg_payment_${orderId.replaceAll("-", "")}`;
}

export function secureTokenEquals(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

export function hashGuestAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function guestAccessTokenMatches(
  receivedToken: string,
  storedHash?: string | null,
  legacyToken?: string | null
) {
  if (storedHash) {
    return secureTokenEquals(hashGuestAccessToken(receivedToken), storedHash);
  }

  return Boolean(legacyToken && secureTokenEquals(receivedToken, legacyToken));
}
