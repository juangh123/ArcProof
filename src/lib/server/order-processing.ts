import type { OrderRecord, OrderStatus } from "@/lib/domain/order";
import { UserFacingError } from "@/lib/server/errors";
import { extractQuoteFromText } from "@/lib/server/extract";
import { logEvent } from "@/lib/server/logger";
import {
  MAX_PROCESSING_ATTEMPTS,
  claimOrderForProcessing,
  completeOrder,
  failOrder,
  getOrderById,
} from "@/lib/server/repository";

export type OrderProcessingOutcome =
  | { status: "already_completed"; order: OrderRecord }
  | { status: "ineligible"; order: OrderRecord; error: string }
  | { status: "not_claimed"; order: OrderRecord | null; error: string }
  | { status: "completed"; order: OrderRecord }
  | { status: "failed"; order: OrderRecord | null; error: string };

const PROCESSABLE_STATUSES = new Set<OrderStatus>([
  "payment_verified",
  "failed",
  "processing",
]);

// Shared by the private process route and the public resume route so both
// entry points keep identical claim, lease, retry-limit and failure rules.
export async function processVerifiedOrder(
  order: OrderRecord,
): Promise<OrderProcessingOutcome> {
  if (order.status === "completed") {
    return { status: "already_completed", order };
  }

  if (!PROCESSABLE_STATUSES.has(order.status)) {
    return {
      status: "ineligible",
      order,
      error: "The Arc payment must be verified before processing.",
    };
  }

  const processingAttempt = claimOrderForProcessing(order.id);

  if (!processingAttempt) {
    const current = getOrderById(order.id);
    const attempts = current?.processingAttempts ?? order.processingAttempts;
    let error = "The order could not be claimed for processing.";

    if (attempts >= MAX_PROCESSING_ATTEMPTS) {
      error = "This order reached the retry limit. Contact support for a refund.";
    } else if (order.status === "processing") {
      error =
        "The order is already being processed and its lease has not expired.";
    }

    return { status: "not_claimed", order: current, error };
  }

  try {
    const quote = order.quoteResult
      ? order.quoteResult
      : order.sourceText
        ? await extractQuoteFromText(order.sourceText)
        : null;

    if (!quote) {
      throw new UserFacingError(
        "The stored quotation result is unavailable. Contact support for a refund.",
      );
    }

    if (quote.lineItems.length === 0) {
      // Do not release a paid, empty result. Keep it retryable without a
      // second payment and surface it as a failed job for manual follow-up.
      throw new UserFacingError(
        "No line items were detected. Retry the document or contact support for a refund.",
      );
    }

    if (!completeOrder(order.id, quote, processingAttempt)) {
      return {
        status: "not_claimed",
        order: getOrderById(order.id),
        error: "This processing lease was replaced by a newer attempt.",
      };
    }

    logEvent("order.processing.completed", {
      publicId: order.publicId,
      extractionMode: quote.extractionMode,
      lineItems: quote.lineItems.length,
    });

    return {
      status: "completed",
      order: getOrderById(order.id) ?? order,
    };
  } catch (error) {
    const userMessage =
      error instanceof UserFacingError
        ? error.message
        : "The quotation could not be processed. Try again or contact support.";

    logEvent("order.processing.failed", {
      publicId: order.publicId,
      reason:
        error instanceof Error ? error.message : "Unknown processing error.",
    });
    failOrder(order.id, userMessage, processingAttempt);

    return { status: "failed", order: getOrderById(order.id), error: userMessage };
  }
}
