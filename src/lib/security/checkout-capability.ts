import "server-only";

const checkoutRouteCapability = Symbol("checkout-route-capability");

export type CheckoutRouteCapability = typeof checkoutRouteCapability;

export function getCheckoutRouteCapability(): CheckoutRouteCapability {
  return checkoutRouteCapability;
}

export function assertCheckoutRouteCapability(
  capability: CheckoutRouteCapability
) {
  if (capability !== checkoutRouteCapability) {
    throw new Error("El checkout solo puede iniciarse desde la ruta protegida");
  }
}
