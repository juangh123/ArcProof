import { getOrderById } from "@/lib/server/repository";
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
  const order = getOrderById(id);

  // The validated draft is stored before payment, so this route must never
  // release it until the paid order has actually been fulfilled. The public
  // proof route applies the same rule through the public id.
  if (!order || order.status !== "completed") {
    return Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    );
  }

  const response = csvResponse(order);

  return (
    response ??
    Response.json(
      { error: "The processed quotation was not found." },
      { status: 404 },
    )
  );
}

