type VariantLabelInput = {
  size?: string | null;
  sizeSystem?: "infant" | "adult" | null;
  size_system?: "infant" | "adult" | null;
  color?: string | null;
  sku?: string | null;
};

export function formatVariantLabel(
  variant: VariantLabelInput | null | undefined
) {
  if (!variant) return "Sin variante";

  const sizeSystem = variant.sizeSystem ?? variant.size_system;
  const sizePrefix =
    sizeSystem === "infant"
      ? "Infantil"
      : sizeSystem === "adult"
        ? "Adulto"
        : null;
  const parts = [
    variant.size
      ? `Talle ${sizePrefix ? `${sizePrefix} ` : ""}${variant.size}`
      : null,
    variant.color ? variant.color : null,
    variant.sku ? `SKU ${variant.sku}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "Variante anterior";
}
