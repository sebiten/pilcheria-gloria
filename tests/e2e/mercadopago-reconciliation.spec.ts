import { expect, test } from "@playwright/test";
import { selectMercadoPagoPayment } from "../../src/lib/mercadopago/reconciliation-selection";

test.describe("selección única de pagos Mercado Pago", () => {
  test("prioriza un aprobado aunque exista un rechazo más reciente", () => {
    const selection = selectMercadoPagoPayment([
      {
        id: "approved-old",
        status: "approved",
        date_last_updated: "2026-08-24T10:00:00Z",
      },
      {
        id: "rejected-new",
        status: "rejected",
        date_last_updated: "2026-08-24T11:00:00Z",
      },
    ]);

    expect(selection.payment?.id).toBe("approved-old");
    expect(selection.ambiguous).toBe(false);
  });

  test("prioriza el pago del intento activo cuando no hay aprobados", () => {
    const selection = selectMercadoPagoPayment(
      [
        {
          id: "rejected-new",
          status: "rejected",
          date_last_updated: "2026-08-24T11:00:00Z",
        },
        {
          id: "pending-active",
          status: "pending",
          date_last_updated: "2026-08-24T10:00:00Z",
          metadata: { payment_attempt_id: "attempt-active" },
        },
      ],
      { id: "attempt-active", external_id: null }
    );

    expect(selection.payment?.id).toBe("pending-active");
  });

  test("usa el más reciente cuando no puede asociarlo a un intento", () => {
    const selection = selectMercadoPagoPayment([
      {
        id: "cancelled-old",
        status: "cancelled",
        date_created: "2026-08-24T09:00:00Z",
      },
      {
        id: "pending-new",
        status: "pending",
        date_created: "2026-08-24T12:00:00Z",
      },
    ]);

    expect(selection.payment?.id).toBe("pending-new");
  });

  test("marca como ambiguos varios pagos aprobados", () => {
    const selection = selectMercadoPagoPayment([
      {
        id: "approved-old",
        status: "approved",
        date_created: "2026-08-24T09:00:00Z",
      },
      {
        id: "approved-new",
        status: "approved",
        date_created: "2026-08-24T12:00:00Z",
      },
    ]);

    expect(selection.payment?.id).toBe("approved-new");
    expect(selection.ambiguous).toBe(true);
    expect(selection.candidatePaymentIds).toEqual([
      "approved-new",
      "approved-old",
    ]);
  });
});
