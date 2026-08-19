import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupCheckoutSmokeProduct,
  getLatestOrderForProduct,
  getVariantStock,
  seedCheckoutSmokeProduct,
} from "./helpers/supabase";

test("guest user can go from product to checkout", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });

    await page.route("**/api/checkout", async (route) => {
      const request = route.request();
      const payload = request.postDataJSON() as {
        items?: Array<{ product_id: string; variant_id: string | null; quantity: number }>;
        shippingAddress?: { email?: string | null; street?: string | null };
      };

      expect(payload.items).toEqual([
        expect.objectContaining({
          product_id: seed.productId,
          variant_id: seed.variantId,
          quantity: 1,
        }),
      ]);
      expect(payload.shippingAddress?.email).toBeNull();
      expect(payload.shippingAddress?.street).toBeNull();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preference: {
            init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=e2e",
          },
        }),
      });
    });

    await page.goto("/uniformes");
    await expect(page.locator(`a[href="/uniformes/${seed.productSlug}"]`).first()).toBeVisible();
    await page.goto(`/uniformes/${seed.productSlug}`);
    await expect(page).toHaveURL(new RegExp(`/uniformes/${seed.productSlug}$`));
    await expect(page.locator("main")).toHaveCount(1);

    const variant = page.locator('#elegir-talle [role="radiogroup"]').last().locator('[role="radio"]').first();
    await variant.click({ force: true });
    await page.locator('[data-testid^="add-to-cart-button"]:visible').click();

    const cartDrawer = page.getByTestId("cart-drawer");
    await expect(cartDrawer).toBeVisible();
    await expect(cartDrawer).toContainText(seed.productName);

    await page.getByTestId("cart-checkout-link").click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(cartDrawer).not.toBeInViewport();
    await expect(page.locator("main")).toHaveCount(1);
    await page.getByRole("button", { name: /cupón/i }).click();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();

    await page.getByLabel("Nombre y apellido").fill("QA Gloria");
    await page.getByRole("button", { name: "Agregar email (opcional)" }).click();
    await expect(page.getByLabel("Email (opcional)")).not.toHaveAttribute(
      "required"
    );
    await page.getByLabel("WhatsApp").fill("123");
    await page.locator('[data-testid^="checkout-submit"]:visible').click();
    await expect(page.getByRole("alert")).toContainText("WhatsApp válido");
    await page.getByLabel("WhatsApp").fill("3884000000");
    await page.locator('[data-testid^="checkout-submit"]:visible').click();
    await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout/);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("repeated checkout request is idempotent", async ({ request }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const checkoutRequestId = randomUUID();
    const checkoutPayload = {
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
        name: "QA Gloria",
        email: "qa+idempotency@example.com",
        phone: "3884000000",
        street: null,
        city: null,
        state: null,
        zip: null,
        references: "Retiro e2e",
      },
    };
    const sendCheckout = () =>
      request.post("/api/checkout", {
        headers: { "Idempotency-Key": checkoutRequestId },
        data: checkoutPayload,
      });

    const firstResponse = await sendCheckout();
    const secondResponse = await sendCheckout();
    expect(firstResponse.ok()).toBe(true);
    expect(secondResponse.ok()).toBe(true);

    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();
    expect(firstBody.order).toBeUndefined();
    expect(secondBody.order).toBeUndefined();
    expect(secondBody.preference.init_point).toBe(
      firstBody.preference.init_point
    );
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);
    await expect
      .poll(async () => getLatestOrderForProduct(seed.productId))
      .toMatchObject({ id: checkoutRequestId, status: "pending" });
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});
