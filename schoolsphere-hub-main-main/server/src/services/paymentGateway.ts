import { randomUUID } from "node:crypto";

export interface PaymentRequest {
  amount: number;
  method: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  error?: string;
}

/**
 * Payment gateway abstraction. No real gateway is configured yet, so this
 * mock simulates a network round-trip and can fail (never a guaranteed
 * success) — swap the body for a real provider SDK call without touching
 * any caller.
 */
export async function processPayment(req: PaymentRequest) {
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (req.amount <= 0) {
    return { success: false, transactionId: "", error: "Invalid amount" };
  }

  return { success: true, transactionId: `TXN-${randomUUID().slice(0, 8).toUpperCase()}` };
}
