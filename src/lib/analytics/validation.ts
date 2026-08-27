import { z } from "zod";
import {
  ANALYTICS_EVENT_DETAILS,
  ANALYTICS_VERSION,
  CHECKOUT_BLOCKED_DETAILS,
  CHECKOUT_VALIDATION_ERROR_DETAILS,
  CLIENT_ANALYTICS_EVENT_NAMES,
} from "@/lib/analytics/types";

const checkoutBlockedDetails = new Set<string>(CHECKOUT_BLOCKED_DETAILS);
const checkoutValidationErrorDetails = new Set<string>(
  CHECKOUT_VALIDATION_ERROR_DETAILS
);

export const analyticsEventSchema = z
  .object({
    sessionId: z.string().uuid(),
    event: z.enum(CLIENT_ANALYTICS_EVENT_NAMES),
    path: z.string().trim().startsWith("/").max(200),
    productId: z.string().uuid().optional(),
    schoolId: z.string().trim().max(80).regex(/^[a-z0-9-]+$/).optional(),
    source: z.enum([
      "direct",
      "whatsapp",
      "facebook",
      "instagram",
      "google",
      "other",
    ]),
    deviceType: z.enum(["mobile", "tablet", "desktop"]),
    quantity: z.number().int().min(1).max(20).optional(),
    analyticsVersion: z.literal(ANALYTICS_VERSION),
    campaign: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    medium: z
      .string()
      .trim()
      .max(48)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    content: z
      .string()
      .trim()
      .max(80)
      .regex(/^[a-z0-9_-]+$/)
      .optional(),
    eventDetail: z.enum(ANALYTICS_EVENT_DETAILS).optional(),
  })
  .superRefine((event, context) => {
    const detail = event.eventDetail;

    if (event.event === "checkout_blocked") {
      if (!detail || !checkoutBlockedDetails.has(detail)) {
        context.addIssue({
          code: "custom",
          message: "El bloqueo requiere un motivo técnico válido",
          path: ["eventDetail"],
        });
      }
      return;
    }

    if (event.event === "checkout_validation_error") {
      if (!detail || !checkoutValidationErrorDetails.has(detail)) {
        context.addIssue({
          code: "custom",
          message: "El error requiere un motivo de validación válido",
          path: ["eventDetail"],
        });
      }
      return;
    }

    if (detail) {
      context.addIssue({
        code: "custom",
        message: "El evento no admite detalle",
        path: ["eventDetail"],
      });
    }
  });

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;
