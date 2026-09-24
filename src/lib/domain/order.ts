import type { QuoteResult } from "@/lib/domain/quote";

export type OrderStatus =
  | "awaiting_payment"
  | "verifying"
  | "payment_verified"
  | "payment_rejected"
  | "processing"
  | "completed"
  | "failed";

export type PaymentProof = {
  txHash: `0x${string}`;
  blockNumber: string;
  blockHash: `0x${string}`;
  payerAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  memoId: `0x${string}`;
  amountNativeAtomic: string;
  amountErc20Atomic: string;
  canonicalEmitter: `0x${string}`;
  logIndex: number;
  nativeEventOmitted: boolean;
  verificationMode: "live" | "fixture";
};

export type OrderRecord = {
  id: string;
  publicId: string;
  status: OrderStatus;
  sourceName: string;
  sourceKind: string;
  sourceText: string;
  quoteResult: QuoteResult | null;
  extractionMode: "ai" | "heuristic" | null;
  paymentMemoId: `0x${string}`;
  amountDisplay: string;
  amountAtomic18: string;
  amountAtomic6: string;
  recipientAddress: `0x${string}`;
  network: "mainnet" | "testnet";
  chainId: number;
  txHash: `0x${string}` | null;
  payerAddress: `0x${string}` | null;
  blockNumber: string | null;
  blockHash: `0x${string}` | null;
  paymentProof: PaymentProof | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  processedAt: string | null;
  processingAttempts: number;
  processingStartedAt: string | null;
  isPublic: boolean;
};

export type OrderEvent = {
  id: number;
  orderId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  verifying: "Verifying on Arc",
  payment_verified: "Payment verified",
  payment_rejected: "Payment rejected",
  processing: "Processing quote",
  completed: "Completed",
  failed: "Needs attention",
};
