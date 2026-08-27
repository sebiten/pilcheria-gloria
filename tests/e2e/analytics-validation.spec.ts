import { expect, test } from "@playwright/test";
import {
  CHECKOUT_BLOCKED_DETAILS,
  CHECKOUT_VALIDATION_ERROR_DETAILS,
} from "../../src/lib/analytics/types";
import { analyticsEventSchema } from "../../src/lib/analytics/validation";

const baseEvent = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  path: "/checkout",
  source: "direct" as const,
  deviceType: "mobile" as const,
  analyticsVersion: 7 as const,
};

test("analytics v7 acepta los eventos y detalles compatibles", () => {
  for (const event of ["checkout_ready", "checkout_form_started"] as const) {
    expect(analyticsEventSchema.safeParse({ ...baseEvent, event }).success).toBe(
      true
    );
  }

  for (const eventDetail of CHECKOUT_BLOCKED_DETAILS) {
    expect(
      analyticsEventSchema.safeParse({
        ...baseEvent,
        event: "checkout_blocked",
        eventDetail,
      }).success
    ).toBe(true);
  }

  for (const eventDetail of CHECKOUT_VALIDATION_ERROR_DETAILS) {
    expect(
      analyticsEventSchema.safeParse({
        ...baseEvent,
        event: "checkout_validation_error",
        eventDetail,
      }).success
    ).toBe(true);
  }
});

test("analytics v7 rechaza combinaciones event/detail incompatibles", () => {
  const invalidEvents = [
    { event: "checkout_blocked" },
    { event: "checkout_validation_error" },
    {
      event: "checkout_blocked",
      eventDetail: CHECKOUT_VALIDATION_ERROR_DETAILS[0],
    },
    {
      event: "checkout_validation_error",
      eventDetail: CHECKOUT_BLOCKED_DETAILS[0],
    },
    { event: "checkout_ready", eventDetail: CHECKOUT_BLOCKED_DETAILS[0] },
    {
      event: "checkout_form_started",
      eventDetail: CHECKOUT_VALIDATION_ERROR_DETAILS[0],
    },
  ];

  for (const event of invalidEvents) {
    expect(analyticsEventSchema.safeParse({ ...baseEvent, ...event }).success).toBe(
      false
    );
  }
});
