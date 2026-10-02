import { NextResponse } from "next/server";
import { extractQuoteFromText } from "@/lib/server/extract";
import {
  claimOrderForProcessing,
  completeOrder,
  failOrder,
  getOrderByPublicId,
} from "@/lib/server/repository";
import { logEvent } from "@/lib/server/logger";
import { getClientKey, orderProcessLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rateLimit = orderProcessLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many processing requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const order = getOrderByPublicId(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === "completed") {
    return NextResponse.json({ status: "completed" });
  }

  if (
    order.status !== "payment_verified" &&
    order.status !== "failed" &&
    order.status !== "processing"
  ) {
    return NextResponse.json(
      { error: "The Arc payment must be verified before processing." },
      { status: 409 },
    );
  }

  const processingAttempt = claimOrderForProcessing(order.id);

  if (!processingAttempt) {
    return NextResponse.json(
      {
        error:
          order.status === "processing"
            ? "The order is already being processed and its lease has not expired."
            : "The order could not be claimed for processing.",
      },
      { status: 409 },
    );
  }

  try {
    const quote = order.quoteResult
      ? order.quoteResult
      : order.sourceText
        ? await extractQuoteFromText(order.sourceText)
        : null;

    if (!quote) {
      throw new Error(
        "The stored quotation result is unavailable. Contact support for a refund.",
      );
    }

    if (quote.lineItems.length === 0) {
      throw new Error(
        "No line items were detected. Retry the document or contact support for a refund.",
      );
    }

    const completedNow = completeOrder(
      order.id,
      quote,
      processingAttempt,
    );

    if (!completedNow) {
      return NextResponse.json(
        { error: "This processing lease was replaced by a newer attempt." },
        { status: 409 },
      );
    }

    logEvent("order.processing.completed", {
      publicId: order.publicId,
      extractionMode: quote.extractionMode,
      lineItems: quote.lineItems.length,
    });

    return NextResponse.json({ status: "completed" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The quotation could not be processed.";

    logEvent("order.processing.failed", {
      publicId: order.publicId,
      reason: message,
    });
    failOrder(order.id, message, processingAttempt);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
