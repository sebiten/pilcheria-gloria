import { expect, test } from "@playwright/test";
import {
  cleanupCheckoutSmokeProduct,
  enableBankTransferForTest,
  getBankTransferAttempt,
  getLatestOrderForProduct,
  restoreBankTransferAfterTest,
  seedCheckoutSmokeProduct,
} from "./helpers/supabase";

test("checkout invitado reserva por transferencia e informa el pago una sola vez", async ({
  page,
  browser,
}) => {
  const seed = await seedCheckoutSmokeProduct();
  const snapshot = await enableBankTransferForTest();

  try {
    await page.goto(`/uniformes/${seed.productSlug}`);
    await page.locator('#elegir-talle [role="radiogroup"]').last().locator('[role="radio"]').first().click({ force: true });
    await page.locator('[data-testid^="add-to-cart-button"]:visible').click();
    await page.getByTestId("cart-checkout-link").click();
    await page.getByLabel("Nombre y apellido").fill("Cliente Transferencia");
    await page.getByLabel("WhatsApp").fill("3884000000");
    await page.locator('label[for="payment-bank_transfer"]').click();
    const checkoutSubmit = page.locator('[data-testid^="checkout-submit"]:visible');
    await expect(checkoutSubmit).toHaveAccessibleName(
      "Reservar y ver datos de transferencia"
    );
    await checkoutSubmit.click();

    await expect(page).toHaveURL(/\/order-confirmation\/[0-9a-f-]+$/, {
      timeout: 30_000,
    });
    await expect(page.getByText("Datos para transferir")).toBeVisible();
    await expect(page.getByText("gloria.e2e")).toBeVisible();
    await expect(page.getByText("PILCHERIA GLORIA E2E")).toBeVisible();

    const order = await getLatestOrderForProduct(seed.productId);
    const attempts = (order as any).payment_attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ provider: "bank_transfer", status: "pending", amount: 125000 });
    const expiresInMinutes =
      (new Date(order.reservation_expires_at!).getTime() - Date.now()) / 60_000;
    expect(expiresInMinutes).toBeGreaterThan(115);
    expect(expiresInMinutes).toBeLessThanOrEqual(120);

    const thirdParty = await browser.newContext();
    const denied = await thirdParty.request.post(
      `/api/order-confirmation/${order.id}/bank-transfer/report`,
      { headers: { "Idempotency-Key": crypto.randomUUID() } }
    );
    expect(denied.ok()).toBe(false);
    await thirdParty.close();

    const idempotencyKey = crypto.randomUUID();
    const report = () =>
      page.request.post(`/api/order-confirmation/${order.id}/bank-transfer/report`, {
        headers: { "Idempotency-Key": idempotencyKey },
      });
    const first = await report();
    const second = await report();
    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);
    expect((await first.json()).whatsappUrl).toContain("wa.me/5493884000000");
    expect(await getBankTransferAttempt(order.id)).toMatchObject({ status: "review" });

    const reviewedOrder = await getLatestOrderForProduct(seed.productId);
    expect(reviewedOrder.status).toBe("payment_review");
    const reviewExpiresInHours =
      (new Date(reviewedOrder.reservation_expires_at!).getTime() - Date.now()) / 3_600_000;
    expect(reviewExpiresInHours).toBeGreaterThan(23.9);
    expect(reviewExpiresInHours).toBeLessThanOrEqual(24);
  } finally {
    await restoreBankTransferAfterTest(snapshot);
    await cleanupCheckoutSmokeProduct(seed);
  }
});
