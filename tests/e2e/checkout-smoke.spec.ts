import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupCheckoutSmokeProduct,
  getLatestOrderForProduct,
  getVariantStock,
  seedCheckoutSmokeProduct,
} from "./helpers/supabase";

type TrackedAnalyticsEvent = {
  event: string;
  eventDetail?: string;
  [key: string]: unknown;
};

async function openSeededProductInCart(
  page: Page,
  seed: Awaited<ReturnType<typeof seedCheckoutSmokeProduct>>,
  quantity = 1
) {
  await page.goto(`/uniformes/${seed.productSlug}`);
  const variant = page
    .locator('#elegir-talle [role="radiogroup"]')
    .last()
    .locator('[role="radio"]')
    .first();
  await variant.click({ force: true });
  await page.locator('[data-testid^="add-to-cart-button"]:visible').click();

  for (let current = 1; current < quantity; current += 1) {
    await page.getByRole("button", { name: "Sumar una unidad" }).click();
  }

  await page.getByTestId("cart-checkout-link").click();
  await expect(page).toHaveURL(/\/checkout$/);
}

function visibleCheckoutSubmit(page: Page) {
  return page.locator('[data-testid^="checkout-submit"]:visible');
}

test("guest user can go from product to checkout", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();
  let checkoutRequests = 0;
  const checkoutIdempotencyKeys: string[] = [];
  const analyticsEvents: TrackedAnalyticsEvent[] = [];
  const requestTimeline: string[] = [];

  try {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });

    await page.route("**/api/analytics", async (route) => {
      const payload = route.request().postDataJSON() as TrackedAnalyticsEvent;
      analyticsEvents.push(payload);
      requestTimeline.push(`analytics:${payload.event}`);
      await route.fulfill({ status: 202 });
    });

    await page.route("**/api/checkout", async (route) => {
      checkoutRequests += 1;
      requestTimeline.push("checkout_api");
      const request = route.request();
      checkoutIdempotencyKeys.push(
        request.headers()["idempotency-key"] || ""
      );
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
      expect(payload.shippingAddress?.email).toBe("qa.gloria@example.com");
      expect(payload.shippingAddress?.street).toBeNull();

      if (checkoutRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: "Mercado Pago no respondió. Reintentá." }),
        });
        return;
      }

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
    await expect(page.getByRole("heading", { name: "Finalizar compra" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "1. Entrega" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "2. Tus datos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "3. Revisá y continuá al pago" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByTestId("cart-refresh-status")).toContainText(
      "Precios y disponibilidad actualizados"
    );
    await expect
      .poll(
        () => analyticsEvents.filter((event) => event.event === "checkout_ready").length
      )
      .toBe(1);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);

      const visibleSubmit = page.locator('[data-testid^="checkout-submit"]:visible');
      const submitBox = await visibleSubmit.boundingBox();
      expect(submitBox).not.toBeNull();
      expect(submitBox!.x).toBeGreaterThanOrEqual(0);
      expect(submitBox!.x + submitBox!.width).toBeLessThanOrEqual(width);
      await expect(visibleSubmit).toHaveAccessibleName("Continuar a Mercado Pago");
    }
    await page.getByRole("button", { name: /cupón/i }).click();
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeVisible();

    const submit = visibleCheckoutSubmit(page);
    await submit.click();
    await expect
      .poll(
        () =>
          analyticsEvents.filter((event) => event.event === "checkout_cta_click")
            .length
      )
      .toBe(1);
    expect(
      analyticsEvents.filter((event) => event.event === "checkout_submit")
    ).toHaveLength(0);
    await expect(page.getByLabel("Nombre y apellido")).toBeFocused();
    await expect(page.locator("#fullName-error")).toContainText("nombre y apellido");

    await page.getByLabel("Nombre y apellido").fill("QA Gloria");
    await page.getByRole("button", { name: "Agregar email (opcional)" }).click();
    await expect(page.getByLabel("Email (opcional)")).not.toHaveAttribute(
      "required"
    );
    await page.getByLabel("WhatsApp").fill("");
    await submit.click();
    await expect(page.getByLabel("WhatsApp")).toBeFocused();
    await expect(page.locator("#phone-error")).toContainText("WhatsApp válido");
    await page.getByLabel("WhatsApp").fill("123");
    await page.getByLabel("WhatsApp").blur();
    await expect(page.locator("#phone-error")).toContainText("10 dígitos");
    await page.getByLabel("WhatsApp").fill("0388 15 4000000");
    await page.getByLabel("Email (opcional)").fill("correo-invalido");
    await page.getByLabel("Email (opcional)").blur();
    await expect(page.locator("#email-error")).toContainText("email válido");
    await page.getByLabel("Email (opcional)").fill("qa.gloria@example.com");

    await expect
      .poll(
        () =>
          analyticsEvents.filter(
            (event) => event.event === "checkout_form_started"
          ).length
      )
      .toBe(1);
    const formStarted = analyticsEvents.find(
      (event) => event.event === "checkout_form_started"
    );
    expect(formStarted).not.toHaveProperty("eventDetail");
    expect(JSON.stringify(formStarted)).not.toContain("QA Gloria");
    expect(JSON.stringify(formStarted)).not.toContain("0388 15 4000000");
    expect(JSON.stringify(formStarted)).not.toContain("qa.gloria@example.com");
    expect(formStarted).not.toHaveProperty("field");
    expect(formStarted).not.toHaveProperty("value");

    await submit.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByText("No pudimos continuar")).toBeVisible();
    await expect(page.getByText("Tus datos siguen cargados")).toBeVisible();
    await expect(page.getByLabel("Nombre y apellido")).toHaveValue("QA Gloria");
    expect(checkoutRequests).toBe(1);
    expect(
      analyticsEvents.filter((event) => event.event === "checkout_submit")
    ).toHaveLength(1);
    expect(requestTimeline.indexOf("analytics:checkout_submit")).toBeLessThan(
      requestTimeline.indexOf("checkout_api")
    );

    await submit.click();
    await expect.poll(() => checkoutRequests).toBe(2);
    expect(new Set(checkoutIdempotencyKeys).size).toBe(1);
    expect(checkoutIdempotencyKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout/);
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("guest local delivery asks only for the necessary address", async ({ page }) => {
  const seed = await seedCheckoutSmokeProduct();
  let refreshAttempts = 0;
  const analyticsEvents: TrackedAnalyticsEvent[] = [];

  try {
    await page.addInitScript(() => window.localStorage.clear());
    await page.route("**/api/analytics", async (route) => {
      analyticsEvents.push(
        route.request().postDataJSON() as TrackedAnalyticsEvent
      );
      await route.fulfill({ status: 202 });
    });
    await page.route("**/checkout", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"]) {
        await route.continue();
        return;
      }

      refreshAttempts += 1;
      if (refreshAttempts === 1) {
        await route.abort("connectionfailed");
        return;
      }
      await route.continue();
    });

    let checkoutPayload: {
      shippingMethod?: string;
      shippingAddress?: Record<string, string | null>;
    } | null = null;
    await page.route("**/api/checkout", async (route) => {
      checkoutPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          preference: {
            init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=delivery-e2e",
          },
        }),
      });
    });

    await openSeededProductInCart(page, seed, 2);
    await expect(page.getByTestId("cart-refresh-status")).toContainText(
      "No pudimos actualizar el carrito"
    );
    await expect(visibleCheckoutSubmit(page)).toBeDisabled();
    await expect
      .poll(
        () =>
          analyticsEvents.filter(
            (event) =>
              event.event === "checkout_blocked" &&
              event.eventDetail === "cart_refresh_failed"
          ).length
      )
      .toBe(1);
    await page.getByRole("button", { name: "Reintentar actualización" }).click();
    await expect(page.getByTestId("cart-refresh-status")).toContainText(
      "Precios y disponibilidad actualizados"
    );
    await expect
      .poll(
        () => analyticsEvents.filter((event) => event.event === "checkout_ready").length
      )
      .toBe(1);
    expect(
      analyticsEvents.filter((event) => event.event === "checkout_blocked")
    ).toHaveLength(1);

    const localDelivery = page.getByRole("radio", { name: /Entrega local|Envío local gratis/ });
    test.skip(
      !(await localDelivery.isVisible()),
      "La configuración E2E actual no tiene habilitada la entrega local"
    );
    await page.locator('label[for="local_delivery"]').click();
    await expect(localDelivery.first()).toBeChecked();

    await expect(page.getByLabel("Provincia")).toHaveCount(0);
    await expect(page.getByLabel("Código postal")).toHaveCount(0);
    await page.getByLabel("Nombre y apellido").fill("QA Entrega");
    await page.getByLabel("WhatsApp").fill("+54 9 388 4000000");
    await page.getByLabel("Calle y número").fill("");
    await visibleCheckoutSubmit(page).click();
    await expect(page.getByLabel("Calle y número")).toBeFocused();
    await expect(page.locator("#street-error")).toContainText("calle y el número");

    await page.getByLabel("Calle y número").fill("Belgrano 245");
    await page.locator("#city").fill("");
    await visibleCheckoutSubmit(page).click();
    await expect(page.locator("#city")).toBeFocused();
    await expect(page.locator("#city-error")).toContainText("localidad");

    await page.locator("#city").fill("Ledesma");
    await page.getByLabel("Referencia (opcional)").fill("Portón gris");
    await visibleCheckoutSubmit(page).click();
    await expect(page).toHaveURL(/mercadopago\.com\.ar\/checkout/);
    expect(checkoutPayload).toMatchObject({
      shippingMethod: "local_delivery",
      shippingAddress: {
        street: "Belgrano 245",
        city: "Ledesma",
        state: expect.any(String),
        zip: null,
        references: "Portón gris",
      },
    });
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});

test("repeated checkout request is idempotent", async ({ request }) => {
  const seed = await seedCheckoutSmokeProduct({ stock: 1 });

  try {
    const checkoutRequestId = randomUUID();
    const checkoutPayload = {
      paymentProvider: "mercadopago",
      items: [
        {
          product_id: seed.productId,
          variant_id: seed.variantId,
          quantity: 1,
        },
      ],
      expectedSubtotal: 125000,
      expectedDiscount: 0,
      expectedShippingCost: 0,
      expectedTotal: 125000,
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
    await expect.poll(async () => getVariantStock(seed.variantId)).toBe(0);
    await expect
      .poll(async () => getLatestOrderForProduct(seed.productId))
      .toMatchObject({ id: checkoutRequestId, status: "pending" });
  } finally {
    await cleanupCheckoutSmokeProduct(seed);
  }
});
