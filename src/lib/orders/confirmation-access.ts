import "server-only";

import { timingSafeEqual } from "node:crypto";

export function getOrderConfirmationCookieName(orderId: string) {
  return `pg_order_${orderId.replaceAll("-", "")}`;
}

export function secureTokenEquals(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}
