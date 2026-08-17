import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  cleanupCheckoutSmokeProduct,
  createExpiredOrderForProduct,
  createPendingOrderForProduct,
  getLatestOrderForProduct,
  getOrderState,
  getVariantStock,
  seedCheckoutSmokeProduct,
} from "./helpers/supabase";

function createMercadoPagoSignature({
  dataId,
  requestId,
  timestamp,
}: {
  dataId: string;
  requestId: string;
  timestamp: string;
}) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Falta MERCADOPAGO_WEBHOOK_SECRET");
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");

  return `ts=${timestamp},v1=${signature}`;
}

test("approved MercadoPago webhook marks guest order as paid", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });

    await page.goto(`/uniformes/${seed.productSlug}`);
    await page.locator('#elegir-talle [role="radiogroup"]').last().locator('[role="radio"]').first().click({ force: true });
    await page.getByTestId("add-to-cart-button").click();
    await page.getByTestId("cart-checkout-link").click();

    await page.getByLabel("Nombre").fill("QA");
    await page.getByLabel("Apellido").fill("Gloria");
    await page.getByLabel("Email").fill("qa+gloria@example.com");
    await page.getByLabel("Teléfono").fill("3884000000");

    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/checkout") &&
        response.request().method() === "POST"
    );

    await page.getByTestId("checkout-submit").click();
    const checkoutResponse = await checkoutResponsePromise;
    expect(checkoutResponse.ok()).toBe(true);

    const pendingOrder = await getLatestOrderForProduct(seed.productId);
    expect(pendingOrder).toMatchObject({
      status: "pending",
      mercadopago_id: null,
      mercadopago_status: null,
      stock_reserved: true,
      stock_restored: false,
    });
    expect(pendingOrder.items).toEqual([
      expect.objectContaining({
        product_id: seed.productId,
        variant_id: seed.variantId,
        quantity: 1,
      }),
    ]);
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);

    const requestId = `e2e-request-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const response = await page.request.post(
      `/api/webhooks/mercadopago?type=payment&data.id=${pendingOrder.id}`,
      {
        headers: {
          "x-request-id": requestId,
          "x-signature": createMercadoPagoSignature({
            dataId: pendingOrder.id,
            requestId,
            timestamp,
          }),
        },
        data: {
          type: "payment",
          data: { id: pendingOrder.id },
        },
      }
    );

    expect(response.ok()).toBe(true);

    await expect
      .poll(async () => getLatestOrderForProduct(seed.productId), {
        timeout: 10_000,
      })
      .toMatchObject({
        id: pendingOrder.id,
        status: "paid",
        mercadopago_id: pendingOrder.id,
        mercadopago_status: "approved",
        stock_restored: false,
        stock_reserved: true,
      });
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("expired unpaid order releases reserved stock", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const orderId = await createExpiredOrderForProduct(seed);
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);

    const response = await page.request.post("/api/cron/expire-orders", {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });

    expect(response.ok()).toBe(true);
    await expect.poll(async () => getOrderState(orderId)).toMatchObject({
      status: "cancelled",
      stock_reserved: false,
      stock_restored: true,
      cancel_reason: "Reserva vencida sin pago",
    });
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(5);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("MercadoPago webhook rejects an invalid signature", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const orderId = await createPendingOrderForProduct(seed);
    const response = await page.request.post(
      `/api/webhooks/mercadopago?type=payment&data.id=${orderId}`,
      {
        headers: {
          "x-request-id": `invalid-${Date.now()}`,
          "x-signature": `ts=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`,
        },
        data: {
          type: "payment",
          data: { id: orderId },
        },
      }
    );

    expect(response.status()).toBe(401);
    await expect.poll(async () => getOrderState(orderId)).toMatchObject({
      status: "pending",
      mercadopago_id: null,
      mercadopago_status: null,
    });
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});
