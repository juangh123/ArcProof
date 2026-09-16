import { NextResponse } from "next/server";
import { getArcRuntimeConfig } from "@/lib/arc/config";
import { serializeOrder } from "@/lib/api/serialize";
import {
  cleanupStaleUnpaidOrders,
  createOrder,
  getOrderEvents,
} from "@/lib/server/repository";
import { SAMPLE_QUOTE_TEXT } from "@/lib/server/sample";
import { extractTextFromFile } from "@/lib/server/extract";
import { logEvent } from "@/lib/server/logger";
import { orderCreateLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const config = getArcRuntimeConfig();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientKey =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rateLimit = orderCreateLimiter.check(clientKey);

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

  if (!config.recipientAddress) {
    return NextResponse.json(
      {
        error:
          "ARC_RECIPIENT_ADDRESS is not configured. Add a valid Arc address before creating a payment order.",
      },
      { status: 503 },
    );
  }

  try {
    cleanupStaleUnpaidOrders();
    const formData = await request.formData();
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

    const order = createOrder({
      sourceName,
      sourceKind,
      sourceText,
      amountDisplay: config.quotePriceUsdc,
      recipientAddress: config.recipientAddress,
      network: config.network,
      chainId: config.chainId,
      isPublic: useSample,
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The quotation could not be prepared.",
      },
      { status: 400 },
    );
  }
}
