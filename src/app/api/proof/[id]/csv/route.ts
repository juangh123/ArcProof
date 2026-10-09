import { getOrderByPublicId } from "@/lib/server/repository";
import { csvResponse } from "@/lib/server/csv";
import {
  getClientKey,
  orderReadLimiter,
  tooManyRequests,
} from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rateLimit = orderReadLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return tooManyRequests(
      rateLimit,
      "Too many download requests. Try again shortly.",
    );
  }

  const { id } = await context.params;
  const order = getOrderByPublicId(id);

  if (!order || order.status !== "completed") {
    return Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    );
  }

  const response = csvResponse(order);

  if (response) {
    return response;
  }

  return Response.json(
    {
      error: order.resultRedactedAt
        ? "The stored result expired and is no longer available."
        : "The processed quotation was not found.",
    },
    { status: order.resultRedactedAt ? 410 : 404 },
  );
}
