function getErrorSummary(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "servicio no disponible";
}

export function reportDataFallback(scope: string, error: unknown) {
  console.warn(`[data-fallback] ${scope}: ${getErrorSummary(error)}`);
}

type CommerceLogEvent = {
  event: string;
  route: string;
  orderId?: string;
  attemptId?: string;
  provider?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  externalId?: string | null;
  reason?: unknown;
};

export function logCommerceEvent(input: CommerceLogEvent) {
  const payload = {
    ...input,
    reason: input.reason ? getErrorSummary(input.reason).slice(0, 500) : undefined,
    timestamp: new Date().toISOString(),
  };
  console.info(JSON.stringify(payload));
}
