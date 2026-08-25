import type { PaymentAttemptStatus, PaymentProvider } from "@/types";

export type PaymentBuyer = {
  name: string;
  email?: string | null;
  phone: string;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export type StartPaymentInput = {
  attemptId: string;
  orderId: string;
  amount: number;
  currency: "ARS";
  reservationExpiresAt: string;
  deviceId?: string | null;
  buyer: PaymentBuyer;
};

export type StartedPayment = {
  providerCheckoutId: string;
  checkoutUrl: string;
  status: Extract<PaymentAttemptStatus, "pending" | "in_process">;
};

export type ProviderPayment = {
  externalId: string;
  orderId: string;
  status: PaymentAttemptStatus;
  statusDetail?: string | null;
  amount: number;
  currency: string;
  receiverAccountId: string;
};

export interface PaymentAdapter {
  readonly provider: PaymentProvider;
  isConfigured(): boolean;
  validateWebhook(input: {
    externalId: string;
    requestId: string | null;
    signature: string | null;
  }): boolean;
  start(input: StartPaymentInput): Promise<StartedPayment>;
  getPayment(externalId: string): Promise<ProviderPayment>;
  expireCheckout(providerCheckoutId: string): Promise<void>;
  cancel(externalId: string): Promise<void>;
  refund(externalId: string, orderId: string): Promise<void>;
}
