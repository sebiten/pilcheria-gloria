import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupCheckoutSmokeProduct,
  getSupabaseAdmin,
  getVariantStock,
  seedCheckoutSmokeProduct,
  type SeededProduct,
} from "./helpers/supabase";

function checkoutPayload(
  seed: SeededProduct,
  overrides: Record<string, unknown> = {}
) {
  return {
    paymentProvider: "mercadopago",
    items: [
      {
        product_id: seed.productId,
        variant_id: seed.variantId,
        quantity: 1,
      },
    ],
    expectedSubtotal: 125000,
    shippingMethod: "pickup",
    shippingAddress: {
      name: "QA Checkout Atómico",
      email: "qa+atomic@example.com",
      phone: "3884000000",
      street: null,
      city: null,
      state: null,
      zip: null,
      references: "Retiro e2e",
    },
    ...overrides,
  };
}

function sendCheckout(
  request: APIRequestContext,
  seed: SeededProduct,
  idempotencyKey: string,
  ip: string,
  overrides: Record<string, unknown> = {}
) {
  return request.post("/api/checkout", {
    headers: {
      "Idempotency-Key": idempotencyKey,
      "x-forwarded-for": ip,
    },
    data: checkoutPayload(seed, overrides),
  });
}

test("dos checkouts concurrentes no venden dos veces la última unidad", async ({
  request,
}) => {
  const seed = await seedCheckoutSmokeProduct({ stock: 1 });

  try {
    const responses = await Promise.all([
      sendCheckout(request, seed, randomUUID(), "10.20.0.1"),
      sendCheckout(request, seed, randomUUID(), "10.20.0.2"),
    ]);

    expect(responses.filter((response) => response.ok())).toHaveLength(1);
    expect(responses.filter((response) => !response.ok())).toHaveLength(1);
    await expect.poll(() => getVariantStock(seed.variantId)).toBe(0);

    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", seed.productId);
    if (error) throw error;
    expect(count).toBe(1);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("la misma clave rechaza un payload distinto", async ({ request }) => {
  const seed = await seedCheckoutSmokeProduct({ stock: 2 });

  try {
    const idempotencyKey = randomUUID();
    const first = await sendCheckout(
      request,
      seed,
      idempotencyKey,
      "10.21.0.1"
    );
    const second = await sendCheckout(
      request,
      seed,
      idempotencyKey,
      "10.21.0.1",
      {
        shippingAddress: {
          ...checkoutPayload(seed).shippingAddress,
          references: "Payload cambiado",
        },
      }
    );

    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(false);
    expect((await second.json()).error).toMatch(/datos diferentes|no coincide/i);
    await expect.poll(() => getVariantStock(seed.variantId)).toBe(1);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("stock, precio u oferta inválidos revierten toda la creación", async ({
  request,
}) => {
  const supabase = getSupabaseAdmin();
  const scenarios = ["stock", "price", "offer"] as const;

  for (const [index, scenario] of scenarios.entries()) {
    const seed = await seedCheckoutSmokeProduct({ stock: 1 });
    try {
      if (scenario === "price") {
        const { error } = await supabase
          .from("variant_offers")
          .update({ sale_price: 130000 })
          .eq("variant_id", seed.variantId);
        if (error) throw error;
      }
      if (scenario === "offer") {
        const { error } = await supabase
          .from("variant_offers")
          .update({ active: false })
          .eq("variant_id", seed.variantId);
        if (error) throw error;
      }

      const overrides =
        scenario === "stock"
          ? {
              items: [
                {
                  product_id: seed.productId,
                  variant_id: seed.variantId,
                  quantity: 2,
                },
              ],
              expectedSubtotal: 250000,
            }
          : {};
      const response = await sendCheckout(
        request,
        seed,
        randomUUID(),
        `10.22.0.${index + 1}`,
        overrides
      );

      expect(response.ok()).toBe(false);
      await expect.poll(() => getVariantStock(seed.variantId)).toBe(1);
      const { count, error } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", seed.productId);
      if (error) throw error;
      expect(count).toBe(0);
    } finally {
      await cleanupCheckoutSmokeProduct(seed);
    }
  }
});

test("dos checkouts concurrentes no consumen dos veces el último uso del cupón", async ({
  request,
}) => {
  const firstSeed = await seedCheckoutSmokeProduct({ stock: 1 });
  const secondSeed = await seedCheckoutSmokeProduct({ stock: 1 });
  const supabase = getSupabaseAdmin();
  const couponCode = `ATOMIC-${Date.now()}`;
  const { error: couponError } = await supabase.from("coupons").insert({
    code: couponCode,
    type: "fixed",
    value: 1000,
    max_uses: 1,
    used_count: 0,
    active: true,
  });
  if (couponError) throw couponError;

  try {
    const responses = await Promise.all([
      sendCheckout(request, firstSeed, randomUUID(), "10.23.0.1", {
        couponCode,
      }),
      sendCheckout(request, secondSeed, randomUUID(), "10.23.0.2", {
        couponCode,
      }),
    ]);

    expect(responses.filter((response) => response.ok())).toHaveLength(1);
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("used_count")
      .eq("code", couponCode)
      .single();
    if (error) throw error;
    expect(coupon.used_count).toBe(1);
    expect(
      (await getVariantStock(firstSeed.variantId)) +
        (await getVariantStock(secondSeed.variantId))
    ).toBe(1);
  } finally {
    await cleanupCheckoutSmokeProduct(firstSeed);
    await cleanupCheckoutSmokeProduct(secondSeed);
    await supabase.from("coupons").delete().eq("code", couponCode);
  }
});
