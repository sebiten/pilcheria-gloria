import "server-only";

const MERCADOPAGO_TIMEOUT_MS = 12_000;

function getMercadoPagoAccessToken() {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN");
  }

  return accessToken;
}

export interface MPPreferenceItem {
  id: string;
  title: string;
  unit_price: number;
  quantity: number;
  picture_url?: string;
  description?: string;
}

export interface MPPreference {
  items: MPPreferenceItem[];
  payer?: {
    name: string;
    surname: string;
    email?: string;
    phone?: {
      area_code?: string;
      number: string;
    };
    address?: {
      zip_code?: string;
      street_name?: string;
      street_number?: number;
    };
  };
  shipments?: {
    mode: string;
    default_shipping_method?: number;
    zip_code?: string;
    receiver_address?: {
      zip_code?: string;
      street_name?: string;
      street_number?: number;
      city_name?: string;
      state_name?: string;
      country_name?: string;
    };
  };
  external_reference?: string;
  metadata?: Record<string, string | number | boolean | null>;
  notification_url?: string;
  back_urls?: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return?: "approved";
  expires?: boolean;
  expiration_date_from?: string;
  expiration_date_to?: string;
  payment_methods?: {
    excluded_payment_types?: Array<{ id: string }>;
  };
  statement_descriptor?: string;
}

export async function createPreference(
  preference: MPPreference,
  idempotencyKey?: string,
  deviceId?: string | null
) {
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    return {
      id: `e2e-${preference.external_reference ?? Date.now()}`,
      init_point: preference.back_urls?.success,
      sandbox_init_point: preference.back_urls?.success,
    };
  }

  const accessToken = getMercadoPagoAccessToken();
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key":
        idempotencyKey || preference.external_reference || crypto.randomUUID(),
      ...(deviceId ? { "X-meli-session-id": deviceId } : {}),
    },
    body: JSON.stringify(preference),
    signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error creating MercadoPago preference: ${errorBody}`);
  }

  return response.json();
}

export async function getPreference(preferenceId: string) {
  const accessToken = getMercadoPagoAccessToken();
  const response = await fetch(`https://api.mercadopago.com/checkout/preferences/${preferenceId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error("Error fetching MercadoPago preference");
  }

  return response.json();
}

export async function searchPaymentsByExternalReference(externalReference: string) {
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    return { results: [] };
  }

  const accessToken = getMercadoPagoAccessToken();
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("external_reference", externalReference);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error searching MercadoPago payments: ${errorBody}`);
  }

  return response.json();
}

export async function getPayment(paymentId: string) {
  const accessToken = getMercadoPagoAccessToken();
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Error fetching MercadoPago payment: ${errorBody}`);
  }

  return response.json();
}

let mercadoPagoAccountIdPromise: Promise<string> | null = null;

export function getMercadoPagoAccountId() {
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    return Promise.resolve("e2e-collector");
  }

  mercadoPagoAccountIdPromise ??= (async () => {
    const accessToken = getMercadoPagoAccessToken();
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error("No se pudo verificar la cuenta receptora de Mercado Pago");
    }

    const account = await response.json();
    if (!account?.id) {
      throw new Error("Mercado Pago no devolvió la cuenta receptora");
    }

    return String(account.id);
  })();

  return mercadoPagoAccountIdPromise.catch((error) => {
    mercadoPagoAccountIdPromise = null;
    throw error;
  });
}

export async function refundPayment(paymentId: string, orderId: string) {
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    return { id: `e2e-refund-${paymentId}`, status: "approved" };
  }

  const accessToken = getMercadoPagoAccessToken();
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": orderId,
      },
      body: JSON.stringify({}),
      cache: "no-store",
      signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`No se pudo devolver el pago en Mercado Pago: ${errorBody}`);
  }

  return response.json();
}

export async function cancelPayment(paymentId: string) {
  if (process.env.E2E_MERCADOPAGO_FAKE === "1") {
    return { id: paymentId, status: "cancelled" };
  }

  const accessToken = getMercadoPagoAccessToken();
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
      cache: "no-store",
      signal: AbortSignal.timeout(MERCADOPAGO_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`No se pudo cancelar el pago en Mercado Pago: ${errorBody}`);
  }

  return response.json();
}
