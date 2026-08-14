import type { StoreSettings } from "@/types";

export const PICKUP_LOCATION_REFERENCE =
  "Pilchería Gloria, local verde manzana.";

type PickupSettings = Pick<
  StoreSettings,
  "address_line" | "city" | "state"
>;

export function hasPickupAddress(settings: PickupSettings) {
  return !/completar|confirmar|industrial 1234/i.test(settings.address_line);
}

export function getPickupAddress(settings: PickupSettings) {
  return [settings.address_line, settings.city, settings.state]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function getGoogleMapsDirectionsUrl(address: string) {
  const params = new URLSearchParams({
    api: "1",
    destination: address,
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function getGoogleMapsEmbedUrl(address: string) {
  const params = new URLSearchParams({
    q: address,
    output: "embed",
  });

  return `https://www.google.com/maps?${params.toString()}`;
}
