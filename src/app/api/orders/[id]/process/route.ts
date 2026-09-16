import { NextResponse } from "next/server";
import { serializeOrder } from "@/lib/api/serialize";
import {
  claimOrderForProcessing,
  completeOrder,
  failOrder,
  getOrderById,
  getOrderEvents,
} from "@/lib/server/repository";
import { extractQuoteFromText } from "@/lib/server/extract";
import { logEvent } from "@/lib/server/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const order = getOrderById(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === "completed") {
    return NextResponse.json({
      order: serializeOrder(order, getOrderEvents(order.id)),
    });
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
    const current = getOrderById(order.id);
    return NextResponse.json(
      {
        error:
          order.status === "processing"
            ? "The order is already being processed and its lease has not expired."
            : "The order could not be claimed for processing.",
        order: current
          ? serializeOrder(current, getOrderEvents(order.id))
          : null,
      },
      { status: 409 },
    );
  }

  try {
    const quote = await extractQuoteFromText(order.sourceText);
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

    const completed = getOrderById(order.id);
    logEvent("order.processing.completed", {
      publicId: order.publicId,
      extractionMode: quote.extractionMode,
      lineItems: quote.lineItems.length,
    });

    return NextResponse.json({
      order: completed
        ? serializeOrder(completed, getOrderEvents(order.id))
        : null,
    });
  } catch (error) {
    logEvent("order.processing.failed", {
      publicId: order.publicId,
      reason:
        error instanceof Error
          ? error.message
          : "Unknown processing error.",
    });
    failOrder(
      order.id,
      error instanceof Error
        ? error.message
        : "The quotation could not be processed.",
      processingAttempt,
    );
    return NextResponse.json(
      { error: "The quotation could not be processed." },
      { status: 500 },
    );
  }
}
