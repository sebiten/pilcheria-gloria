import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  cleanupCheckoutSmokeProduct,
  createExpiredOrderForProduct,
  createPendingOrderForProduct,
  getLatestOrderForProduct,
  getOrderState,
  getPaymentAnalyticsEvents,
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
    await page.locator('[data-testid^="add-to-cart-button"]:visible').click();
    await page.getByTestId("cart-checkout-link").click();

    await page.getByLabel("Nombre y apellido").fill("QA Gloria");
    await page.getByRole("button", { name: "Agregar email (opcional)" }).click();
    await page.getByLabel("Email (opcional)").fill("qa+gloria@example.com");
    await page.getByLabel("WhatsApp").fill("3884000000");

    const checkoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/checkout") &&
        response.request().method() === "POST"
    );

    await page.locator('[data-testid^="checkout-submit"]:visible').click();
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
    const timestamp = Date.now().toString();
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
          "x-signature": `ts=${Date.now()},v1=${"0".repeat(64)}`,
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

test("MercadoPago webhook rejects an expired signature", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const orderId = await createPendingOrderForProduct(seed);
    const requestId = `expired-signature-${Date.now()}`;
    const timestamp = String(Date.now() - 16 * 60 * 1000);
    const response = await page.request.post(
      `/api/webhooks/mercadopago?type=payment&data.id=${orderId}`,
      {
        headers: {
          "x-request-id": requestId,
          "x-signature": createMercadoPagoSignature({
            dataId: orderId,
            requestId,
            timestamp,
          }),
        },
        data: { type: "payment", data: { id: orderId } },
      }
    );

    expect(response.status()).toBe(401);
    await expect.poll(async () => getOrderState(orderId)).toMatchObject({
      status: "pending",
      mercadopago_id: null,
    });
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("rejected webhook keeps the order and stock reserved", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const orderId = await createPendingOrderForProduct(seed);
    const requestId = `rejected-${Date.now()}`;
    const timestamp = Date.now().toString();
    const headers = {
      "x-request-id": requestId,
      "x-signature": createMercadoPagoSignature({
        dataId: orderId,
        requestId,
        timestamp,
      }),
      "x-e2e-payment-status": "rejected",
      "x-e2e-payment-status-detail": "cc_rejected_insufficient_amount",
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await page.request.post(
        `/api/webhooks/mercadopago?type=payment&data.id=${orderId}`,
        { headers, data: { type: "payment", data: { id: orderId } } }
      );
      expect(response.ok()).toBe(true);
    }

    await expect.poll(async () => getOrderState(orderId)).toMatchObject({
      status: "pending",
      stock_reserved: true,
      stock_restored: false,
      mercadopago_status: "rejected",
      mercadopago_status_detail: "cc_rejected_insufficient_amount",
    });
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);
    await expect.poll(async () => getPaymentAnalyticsEvents(orderId)).toEqual([
      expect.objectContaining({
        event_name: "payment_rejected",
        event_detail: "cc_rejected_insufficient_amount",
        payment_id: orderId,
      }),
    ]);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("pending webhook keeps stock and deduplicates analytics", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();

  try {
    const orderId = await createPendingOrderForProduct(seed);
    const initialOrder = await getOrderState(orderId);
    const requestId = `pending-${Date.now()}`;
    const timestamp = Date.now().toString();
    const headers = {
      "x-request-id": requestId,
      "x-signature": createMercadoPagoSignature({
        dataId: orderId,
        requestId,
        timestamp,
      }),
      "x-e2e-payment-status": "pending",
      "x-e2e-payment-status-detail": "pending_contingency",
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await page.request.post(
        `/api/webhooks/mercadopago?type=payment&data.id=${orderId}`,
        { headers, data: { type: "payment", data: { id: orderId } } }
      );
      expect(response.ok()).toBe(true);
    }

    const pendingOrder = await getOrderState(orderId);
    expect(pendingOrder).toMatchObject({
      status: "pending",
      stock_reserved: true,
      stock_restored: false,
      mercadopago_status: "pending",
      mercadopago_status_detail: "pending_contingency",
    });
    expect(new Date(pendingOrder.reservation_expires_at).getTime()).toBeGreaterThan(
      new Date(initialOrder.reservation_expires_at).getTime()
    );
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(4);
    await expect.poll(async () => getPaymentAnalyticsEvents(orderId)).toEqual([
      expect.objectContaining({
        event_name: "payment_pending",
        event_detail: "pending_contingency",
        payment_id: orderId,
      }),
    ]);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});
