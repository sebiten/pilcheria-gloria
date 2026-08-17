import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, devices, type Page } from "@playwright/test";

const baseUrl = process.argv[2] || "http://localhost:3000";

async function auditPage(page: Page) {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    };

    const controls = Array.from(
      document.querySelectorAll("button, a, input, select, textarea, [role='radio']")
    )
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
            element.getAttribute("name") ||
            "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });

    return {
      title: document.title,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      controlCount: controls.length,
      controlsUnder44px: controls.filter(
        (control) => control.width < 44 || control.height < 44
      ),
      bodyText: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 5000),
    };
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices["Pixel 5"],
  locale: "es-AR",
});
const page = await context.newPage();
const consoleErrors: string[] = [];
const failedResponses: Array<{ status: number; url: string }> = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    failedResponses.push({ status: response.status(), url: response.url() });
  }
});
await page.route("**/api/checkout", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      preference: { init_point: "https://example.com/pago-simulado" },
    }),
  });
});

const screenshots = {
  catalog: join(tmpdir(), "gloria-mobile-catalog.png"),
  product: join(tmpdir(), "gloria-mobile-product.png"),
  cart: join(tmpdir(), "gloria-mobile-cart.png"),
  checkout: join(tmpdir(), "gloria-mobile-checkout.png"),
};

await page.goto(`${baseUrl}/uniformes?promo=UNIFORMES26`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2500);
await page.screenshot({ path: screenshots.catalog, fullPage: true });
const catalog = await auditPage(page);

const productHref = await page
  .locator('main a[href^="/uniformes/"]')
  .first()
  .getAttribute("href");
if (!productHref) throw new Error("No se encontro un producto navegable");

await page.goto(`${baseUrl}${productHref}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.screenshot({ path: screenshots.product, fullPage: true });
const product = await auditPage(page);

const requiresSizeSelection = await page
  .getByRole("button", { name: "Elegir diseño y talle" })
  .isVisible();
let selectorGroups = page.locator('#elegir-talle [role="radiogroup"]');
if (await page.getByText("¿Es de Primaria o Secundaria?").isVisible().catch(() => false)) {
  const firstDesignId = await selectorGroups
    .first()
    .locator('[role="radio"]:not([disabled])')
    .first()
    .getAttribute("id");
  if (!firstDesignId) throw new Error("No se encontro un diseño disponible");
  await page.locator(`label[for="${firstDesignId}"]`).click();
  await page.locator('#elegir-talle label[for^="variant-"]').first().waitFor();
  selectorGroups = page.locator('#elegir-talle [role="radiogroup"]');
}
const firstVariant = selectorGroups
  .last()
  .locator('[role="radio"]:not([disabled])')
  .first();
const firstVariantId = await firstVariant.getAttribute("id");
if (!firstVariantId) throw new Error("No se encontro un talle disponible");
await page.locator(`label[for="${firstVariantId}"]`).click();

const addToCartButton = page.getByTestId("add-to-cart-button-mobile");
await addToCartButton.waitFor({ state: "visible" });
await addToCartButton.click();
const cartDrawer = page.getByTestId("cart-drawer");
await cartDrawer.waitFor({ state: "visible" });
await page.waitForTimeout(500);
await page.screenshot({ path: screenshots.cart, fullPage: false });
const cart = await auditPage(page);
const drawer = await cartDrawer.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    transform: getComputedStyle(element).transform,
    text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 1000),
  };
});

await page.getByTestId("cart-checkout-link").click();
await page.waitForURL("**/checkout");
await page.waitForTimeout(1200);
await page.screenshot({ path: screenshots.checkout, fullPage: true });
const checkout = await auditPage(page);
const couponValue = await page.getByLabel(/Código/).inputValue();

if (couponValue) {
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForTimeout(800);
  const couponApplied = await page
    .getByText(/Cupón .* aplicado/i)
    .isVisible()
    .catch(() => false);
  if (!couponApplied) await page.getByLabel(/Código/).fill("");
}

await page.getByLabel("Nombre").fill("Maria");
await page.getByLabel("Apellido").fill("Perez");
await page.getByLabel("Email").fill("maria@example.com");
await page.getByLabel(/Tel.fono/i).fill("3884123456");
await page.getByTestId("checkout-submit-mobile").click();
await page.waitForURL("https://example.com/pago-simulado");

const responsiveChecks: Record<
  string,
  {
    catalogOverflow: number;
    productOverflow: number;
    mobileActionVisible: boolean;
    screenshots: { catalog: string; product: string };
  }
> = {};

for (const viewport of [
  { name: "320", width: 320, height: 568 },
  { name: "430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  const responsiveContext = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "es-AR",
  });
  const responsivePage = await responsiveContext.newPage();
  const catalogScreenshot = join(
    tmpdir(),
    `gloria-${viewport.name}-catalog.png`
  );
  const productScreenshot = join(
    tmpdir(),
    `gloria-${viewport.name}-product.png`
  );

  await responsivePage.goto(`${baseUrl}/uniformes`, {
    waitUntil: "domcontentloaded",
  });
  await responsivePage.waitForTimeout(1200);
  const catalogOverflow = await responsivePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  await responsivePage.screenshot({ path: catalogScreenshot });

  await responsivePage.goto(`${baseUrl}${productHref}`, {
    waitUntil: "domcontentloaded",
  });
  await responsivePage.waitForTimeout(1000);
  const productOverflow = await responsivePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  const mobileActionVisible = await responsivePage
    .getByRole("button", { name: "Elegir diseño y talle" })
    .isVisible()
    .catch(() => false);
  await responsivePage.screenshot({ path: productScreenshot });

  responsiveChecks[viewport.name] = {
    catalogOverflow,
    productOverflow,
    mobileActionVisible,
    screenshots: {
      catalog: catalogScreenshot,
      product: productScreenshot,
    },
  };
  await responsiveContext.close();
}

const redirectContext = await browser.newContext();
const redirectPage = await redirectContext.newPage();
await redirectPage.goto(`${baseUrl}/products?garment=remera`, {
  waitUntil: "domcontentloaded",
});
const oldCatalogRedirect = new URL(redirectPage.url());
await redirectPage.goto(
  `${baseUrl}/products/${productHref.split("/").at(-1)}`,
  { waitUntil: "domcontentloaded" }
);
const oldProductRedirect = new URL(redirectPage.url());
await redirectContext.close();

const report = JSON.stringify(
  {
    productHref,
    requiresSizeSelection,
    couponValue,
    finalUrl: page.url(),
    screenshots,
    catalog,
    product,
    cart,
    drawer,
    checkout,
    responsiveChecks,
    redirects: {
      catalog: `${oldCatalogRedirect.pathname}${oldCatalogRedirect.search}`,
      product: oldProductRedirect.pathname,
    },
    consoleErrors,
    failedResponses,
  },
  null,
  2
);
await writeFile(join(tmpdir(), "gloria-mobile-audit.json"), report);
console.log(report);

await browser.close();
