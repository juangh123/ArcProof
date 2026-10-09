import { NextResponse } from "next/server";
import { getArcRuntimeConfig } from "@/lib/arc/config";
import { serializeOrder } from "@/lib/api/serialize";
import {
  cleanupStaleOrders,
  createOrder,
  getOrderEvents,
} from "@/lib/server/repository";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";
import {
  extractQuoteFromText,
  extractTextFromFile,
} from "@/lib/server/extract";
import { logEvent } from "@/lib/server/logger";
import { getClientKey, orderCreateLimiter } from "@/lib/server/rate-limit";
import {
  MAX_FILE_SIZE,
  isUploadTooLarge,
  readFormDataWithinLimit,
} from "@/lib/server/upload-limit";
import { UserFacingError } from "@/lib/server/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const config = getArcRuntimeConfig();
  const rateLimit = orderCreateLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many order requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  if (config.configErrors.length > 0) {
    logEvent("config.invalid", { errors: config.configErrors });
    return NextResponse.json(
      {
        error:
          "The service is not configured for payments right now. Try again later.",
      },
      { status: 503 },
    );
  }

  if (!config.recipientAddress) {
    return NextResponse.json(
      {
        error:
          "ARC_RECIPIENT_ADDRESS is not configured. Add a valid Arc address before creating a payment order.",
      },
      { status: 503 },
    );
  }

  if (isUploadTooLarge(request)) {
    return NextResponse.json(
      { error: "The request is too large. Upload a document up to 8 MB." },
      { status: 413 },
    );
  }

  try {
    cleanupStaleOrders();
    const upload = await readFormDataWithinLimit(request);

    if (upload.status === "too-large") {
      return NextResponse.json(
        { error: "The request is too large. Upload a document up to 8 MB." },
        { status: 413 },
      );
    }

    const formData = upload.formData;
    const useSample = formData.get("sample") === "true";
    let sourceName = "Northstar quotation sample";
    let sourceKind = "text/plain";
    let sourceText = SAMPLE_QUOTE_TEXT;

    if (!useSample) {
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Choose a PDF or text quotation." },
          { status: 400 },
        );
      }

      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "The document must be between 1 byte and 8 MB." },
          { status: 400 },
        );
      }

      sourceName = file.name;
      sourceKind = file.type || "application/octet-stream";
      sourceText = await extractTextFromFile(file);
    }

    const quoteResult = await extractQuoteFromText(sourceText);

    if (quoteResult.lineItems.length === 0) {
      return NextResponse.json(
        {
          error:
            "No structured line items were found, so no payment request was created. Upload a quotation with a readable table, or provide the table as PDF, TXT, or Markdown.",
        },
        { status: 422 },
      );
    }

    const order = createOrder({
      sourceName,
      sourceKind,
      // The validated draft is stored with the order, so the raw source text
      // does not need to remain on disk while the user completes payment.
      sourceText: "",
      quoteResult,
      amountDisplay: config.quotePriceUsdc,
      recipientAddress: config.recipientAddress,
      network: config.network,
      chainId: config.chainId,
    });
    logEvent("order.created", {
      publicId: order.publicId,
      sourceKind: order.sourceKind,
      network: order.network,
    });

    return NextResponse.json(
      {
        order: serializeOrder(order, getOrderEvents(order.id)),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UserFacingError) {
      logEvent("order.creation.rejected", { reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logEvent("order.creation.failed", {
      reason: error instanceof Error ? error.message : "Unknown error.",
    });
    return NextResponse.json(
      {
        error:
          "The quotation could not be prepared. Try again or contact support.",
      },
      { status: 500 },
    );
  }
}
