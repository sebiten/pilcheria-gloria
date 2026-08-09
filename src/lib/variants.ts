type VariantLabelInput = {
  size?: string | null;
  sizeSystem?: "infant" | "adult" | null;
  size_system?: "infant" | "adult" | null;
  schoolLevel?: "primary" | "secondary" | null;
  school_level?: "primary" | "secondary" | null;
  color?: string | null;
  sku?: string | null;
};

export function formatVariantLabel(
  variant: VariantLabelInput | null | undefined
) {
  if (!variant) return "Sin variante";

  const sizeSystem = variant.sizeSystem ?? variant.size_system;
  const schoolLevel = variant.schoolLevel ?? variant.school_level;
  const schoolLevelLabel =
    schoolLevel === "primary"
      ? "Diseño Primaria"
      : schoolLevel === "secondary"
        ? "Diseño Secundaria"
        : null;
  const sizePrefix =
    sizeSystem === "infant"
      ? "Juvenil"
      : sizeSystem === "adult"
        ? "Adulto"
        : null;
  const parts = [
    schoolLevelLabel,
    variant.size
      ? `Talle ${sizePrefix ? `${sizePrefix} ` : ""}${variant.size}`
      : null,
    variant.color ? variant.color : null,
    variant.sku ? `SKU ${variant.sku}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : "Variante anterior";
}
