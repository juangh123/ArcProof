import { NextResponse } from "next/server";
import { processVerifiedOrder } from "@/lib/server/order-processing";
import { getOrderByPublicId } from "@/lib/server/repository";
import {
  getClientKey,
  orderProcessLimiter,
  tooManyRequests,
} from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const rateLimit = orderProcessLimiter.check(getClientKey(request));

  if (!rateLimit.allowed) {
    return tooManyRequests(
      rateLimit,
      "Too many processing requests. Try again shortly.",
    );
  }

  const order = getOrderByPublicId(id);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const outcome = await processVerifiedOrder(order);

  if (outcome.status === "completed" || outcome.status === "already_completed") {
    return NextResponse.json({ status: "completed" });
  }

  return NextResponse.json(
    { error: outcome.error },
    { status: outcome.status === "failed" ? 500 : 409 },
  );
}
