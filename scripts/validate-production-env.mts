const isProductionDeployment =
  process.env.VERCEL_ENV === "production" ||
  process.env.VALIDATE_PRODUCTION_ENV === "1";

if (isProductionDeployment) {
  const allowDevelopmentClerk =
    process.env.ALLOW_CLERK_DEVELOPMENT_IN_PRODUCTION === "1";
  const required = [
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MERCADOPAGO_ACCESS_TOKEN",
    "MERCADOPAGO_WEBHOOK_SECRET",
    "CRON_SECRET",
    "CHECKOUT_RATE_LIMIT_SECRET",
  ];
  const errors = required
    .filter((key) => !process.env[key]?.trim())
    .map((key) => `Falta ${key}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (process.env.VERCEL_ENV === "production" && allowDevelopmentClerk) {
    errors.push(
      "ALLOW_CLERK_DEVELOPMENT_IN_PRODUCTION no está permitido en producción"
    );
  }
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    errors.push("E2E_MERCADOPAGO_FAKE no puede estar activo en producción");
  }
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") {
    errors.push("E2E_ALLOW_REMOTE_DB no puede estar activo en producción");
  }

  if (
    !allowDevelopmentClerk &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
  ) {
    errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY todavía es de desarrollo");
  }
  if (
    !allowDevelopmentClerk &&
    process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")
  ) {
    errors.push("CLERK_SECRET_KEY todavía es de desarrollo");
  }
  if (!appUrl.startsWith("https://") || /localhost|127\.0\.0\.1/.test(appUrl)) {
    errors.push("NEXT_PUBLIC_APP_URL debe ser una URL HTTPS pública");
  }

  if (errors.length > 0) {
    console.error("Configuración de producción inválida:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  if (allowDevelopmentClerk) {
    console.warn(
      "Clerk development habilitado temporalmente para esta demo. No usar para ventas reales."
    );
  }

  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const metaToken = process.env.META_CONVERSIONS_API_TOKEN?.trim();
  if (Boolean(metaPixelId) !== Boolean(metaToken)) {
    errors.push(
      "NEXT_PUBLIC_META_PIXEL_ID y META_CONVERSIONS_API_TOKEN deben configurarse juntos"
    );
  }
  if (metaPixelId && !/^\d{5,32}$/.test(metaPixelId)) {
    errors.push("NEXT_PUBLIC_META_PIXEL_ID no tiene un formato válido");
  }
}
