type OrderDescriptionItem = {
  product_name: string;
  quantity: number;
  variant_label?: string | null;
  variant_size?: string | null;
  variant_color?: string | null;
};

export function describeOrderItems(items: OrderDescriptionItem[]) {
  return items.map((item) => {
    const variant = item.variant_label?.trim() || [
      item.variant_size?.trim() ? `Talle ${item.variant_size.trim()}` : "",
      item.variant_color?.trim(),
    ].filter(Boolean).join(" · ");
    return [`${item.quantity} x ${item.product_name.trim()}`, variant]
      .filter(Boolean).join(" · ");
  }).join("; ") || "Compra online de prendas en Pilchería Gloria";
}

export function getPayerAddress(buyer: {
  street?: string | null;
  zip?: string | null;
}) {
  const street = buyer.street?.trim() || "";
  const zip = buyer.zip?.trim() || "";
  const match = street.match(/^(.*?)\s+(\d+)$/);
  const number = match ? Number(match[2]) : undefined;
  if (!street && !zip) return undefined;
  return {
    ...(street ? { street_name: match?.[1]?.trim() || street } : {}),
    ...(number !== undefined && Number.isSafeInteger(number)
      ? { street_number: number }
      : {}),
    ...(zip ? { zip_code: zip } : {}),
  };
}
