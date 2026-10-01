export const PRODUCT_INTEREST_SURVEY = "uniforms-v1";

export const PRODUCT_INTEREST_OPTIONS = [
  { value: "dress_pants", label: "Pantalones de vestir de uniforme" },
  { value: "skirts", label: "Polleras" },
  { value: "socks", label: "Medias" },
] as const;

export type ProductInterestChoice = typeof PRODUCT_INTEREST_OPTIONS[number]["value"];
export type ProductInterestPlacement = "home" | "catalog" | "product";
export const PRODUCT_INTEREST_STORAGE = "gloria:product-interest:v1";

export function toggleProductInterest(
  current: ProductInterestChoice[],
  choice: ProductInterestChoice,
): ProductInterestChoice[] {
  if (current.includes(choice)) return current.filter((item) => item !== choice);
  return current.length < 2 ? [...current, choice] : current;
}
